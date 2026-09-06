import { withAlarmRuntimeState } from '../../app-data-mutations';
import { getSleepReminderProjectionKey } from '../../app-store-persistence';
import {
  analyzeAppDataScheduleSafety,
  enforceAppDataScheduleSafety,
} from '../../app-store-schedule-safety';
import type { AppData } from '../../../models/app-data';
import {
  buildAlarmPyoAlarmPlan,
  buildAlarmPyoAlarmSyncMetadata,
  type AlarmPyoAlarmPlan,
  type AlarmPyoAlarmSyncMetadata,
} from '../../../services/alarm-planner';
import { getAlarmScheduleSignature } from '../../../services/alarm-schedule-signature';
import {
  buildSleepReminderPlans,
  getSleepReminderScheduleSignature,
} from '../../../services/sleep-reminder-planner';
import {
  ALARM_DELIVERY_RETRY_GRACE_MS,
  canPreserveActiveAlarmDeliveryRetry,
  canSkipDisabledAlarmStatusCheck,
  isAlarmPyoAlarmPlanContentSynchronized,
  isAlarmPyoAlarmScheduleSynchronized,
  markAlarmDisableSyncPending,
  MAX_NATIVE_SCHEDULED_ALARMS,
  resolveCompletedAlarmAutoCheckStatus,
  shouldBlockAutomaticAlarmRepair,
  shouldSyncAlarmPyoAlarmSnapshot,
} from '../../../services/alarm-sync-policy';
import { applyNativeAlarmSnapshot, runAlarmSyncCheck } from '../alarm-sync-runner';
import type { AppStoreEngineContext, AppStoreOperations } from './engine-context';
import { selectShiftForDate as resolveShiftFromData } from '../../app-store-selectors';
const SLEEP_REMINDER_SYNC_SAVE_ERROR =
  '자료는 저장했지만 수면 알림을 갱신하지 못했습니다. 앱을 다시 열면 자동으로 다시 시도합니다.';

/** Runtime operations share the engine transaction and state; they never own a second store. */
export function registerRuntimeCoordinator(
  context: AppStoreEngineContext,
  operations: AppStoreOperations,
): void {
  operations.reportAlarmSyncFailure = (notificationsEnabled = true) => {
    if (!context.mountedRef.current) return;
    context.setAlarmSyncStatus('error');
    context.setAlarmSyncError(
      notificationsEnabled
        ? '변경 내용은 저장했지만 알람을 다시 예약하지 못했습니다. 알람 화면에서 권한을 확인한 뒤 다시 예약해야 합니다.'
        : '알람을 끄는 설정은 저장했지만 기존 예약을 취소하지 못했습니다. 알람 화면에서 다시 시도해야 합니다.',
    );
    operations.reportSaveIssue(
      'alarm-sync-failed',
      notificationsEnabled
        ? '변경 내용은 저장되었지만 알람을 다시 예약하지 못했습니다. 알람 화면에서 권한을 확인한 뒤 다시 예약해야 합니다.'
        : '알람을 끄는 설정은 저장되었지만 기존 예약을 취소하지 못했습니다. 알람 화면에서 다시 시도해야 합니다.',
    );
  };

  operations.syncAlarmsForSnapshot = async (
    snapshot: AppData,
    preparedPlan?: readonly AlarmPyoAlarmPlan[],
    preparedMetadata?: AlarmPyoAlarmSyncMetadata,
  ) => {
    const session = context.sessionRevisionRef.current;
    if (!context.mountedRef.current || !context.readyRef.current) return false;
    const signature = getAlarmScheduleSignature(snapshot);
    const enforcedScheduleSafety = enforceAppDataScheduleSafety(snapshot, {
      mode: 'ingress',
    });
    const syncSnapshot = enforcedScheduleSafety.data ?? snapshot;
    const scheduleSafetyBlocked = !enforcedScheduleSafety.safety.canEnableAlarms;
    if (scheduleSafetyBlocked) operations.reportUnsafeAlarmSchedule(enforcedScheduleSafety);
    if (context.mountedRef.current) {
      context.setAlarmSyncStatus('syncing');
      context.setAlarmSyncError(null);
    }
    try {
      const plan = syncSnapshot.settings.notificationsEnabled
        ? (preparedPlan ??
          buildAlarmPyoAlarmPlan(syncSnapshot, (dateKey) =>
            resolveShiftFromData(syncSnapshot, dateKey),
          ))
        : [];
      const status = await applyNativeAlarmSnapshot({
        notificationsEnabled: syncSnapshot.settings.notificationsEnabled,
        plan,
        synchronize: (alarms) =>
          context.runtime.synchronizeAlarms(
            alarms,
            preparedMetadata ?? buildAlarmPyoAlarmSyncMetadata(),
          ),
        cancelAll: () => context.runtime.cancelAllAlarms(),
      });
      if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
        return false;
      if (
        status.supported &&
        (!isAlarmPyoAlarmScheduleSynchronized({
          actualScheduledCount: status.scheduledCount,
          exactAlarmAllowed: status.exactAlarmAllowed,
          notificationsAllowed: status.notificationsAllowed,
          plannedAlarmCount: plan.length,
        }) ||
          !isAlarmPyoAlarmPlanContentSynchronized({
            actualScheduledAlarms: status.scheduledAlarms,
            exactAlarmAllowed: status.exactAlarmAllowed,
            notificationsAllowed: status.notificationsAllowed,
            plannedAlarms: plan,
          }))
      ) {
        throw new Error('알람 예약 내용이 계획과 일치하지 않습니다.');
      }
      context.lastTimeZoneOffsetRef.current = context.runtime.now().getTimezoneOffset();
      context.lastAlarmSyncSignatureRef.current = signature;
      if (context.failedAlarmSyncSignatureRef.current === signature) {
        context.failedAlarmSyncSignatureRef.current = null;
      }
      if (context.mountedRef.current) {
        context.setAlarmSyncStatus('synced');
        context.setAlarmSyncError(null);
        operations.clearReportedSaveIssues('retry-alarms');
      }
      operations.updateData((current) => {
        if (getAlarmScheduleSignature(current) !== signature) return current;
        const safeCurrent = scheduleSafetyBlocked
          ? (enforceAppDataScheduleSafety(current, { mode: 'ingress' }).data ?? current)
          : current;
        return withAlarmRuntimeState(
          safeCurrent,
          status.scheduledCount,
          context.runtime.now().toISOString(),
        );
      });
      return true;
    } catch {
      if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
        return false;
      context.failedAlarmSyncSignatureRef.current = signature;
      operations.reportAlarmSyncFailure(syncSnapshot.settings.notificationsEnabled);
      return false;
    }
  };

  operations.syncSleepRemindersForSnapshot = async (
    snapshot: AppData,
    force = false,
  ): Promise<boolean> => {
    const session = context.sessionRevisionRef.current;
    const signature = getSleepReminderScheduleSignature(snapshot);
    const syncNow = context.runtime.now();
    const projectionKey = getSleepReminderProjectionKey(syncNow);
    const attempt = context.sleepReminderSyncAttemptRef.current + 1;
    context.sleepReminderSyncAttemptRef.current = attempt;
    if (
      !context.mountedRef.current ||
      !context.readyRef.current ||
      session !== context.sessionRevisionRef.current
    )
      return false;
    if (
      !force &&
      context.lastSleepReminderSyncSignatureRef.current === signature &&
      (!snapshot.settings.sleepReminderEnabled ||
        context.lastSleepReminderProjectionKeyRef.current === projectionKey)
    ) {
      if (context.mountedRef.current && context.sleepReminderSyncAttemptRef.current === attempt) {
        context.setSleepReminderSyncStatus('synced');
        context.setSleepReminderSyncError(null);
        operations.clearReportedSaveIssues('retry-sleep-reminders');
      }
      return true;
    }
    if (context.mountedRef.current) {
      context.setSleepReminderSyncStatus('syncing');
      context.setSleepReminderSyncError(null);
    }
    try {
      if (snapshot.settings.sleepReminderEnabled && snapshot.settings.setupCompleted) {
        await context.runtime.synchronizeSleepReminders(
          buildSleepReminderPlans(snapshot, { now: syncNow }),
        );
      } else {
        await context.runtime.cancelAllSleepReminders();
      }
      if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
        return false;
      if (context.mountedRef.current) {
        context.setSleepReminderSyncRevision((current) => current + 1);
      }
      context.lastSleepReminderSyncSignatureRef.current = signature;
      context.lastSleepReminderProjectionKeyRef.current = projectionKey;
      context.failedSleepReminderSyncSignatureRef.current = null;
      context.sleepReminderFailureSaveRevisionRef.current = null;
      if (context.mountedRef.current && context.sleepReminderSyncAttemptRef.current === attempt) {
        context.setSleepReminderSyncStatus('synced');
        context.setSleepReminderSyncError(null);
        operations.clearReportedSaveIssues('retry-sleep-reminders');
      }
      return true;
    } catch {
      if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
        return false;
      if (context.mountedRef.current) {
        context.setSleepReminderSyncRevision((current) => current + 1);
      }
      context.failedSleepReminderSyncSignatureRef.current = signature;
      if (context.lastSleepReminderSyncSignatureRef.current === signature) {
        context.lastSleepReminderSyncSignatureRef.current = null;
        context.lastSleepReminderProjectionKeyRef.current = null;
      }
      if (context.mountedRef.current && context.sleepReminderSyncAttemptRef.current === attempt) {
        context.setSleepReminderSyncStatus('error');
        context.setSleepReminderSyncError(SLEEP_REMINDER_SYNC_SAVE_ERROR);
      }
      // 저장 결과 표시는 호출한 저장 흐름에서 결정하고, 앱 복귀·초기 동기화 실패가
      // unrelated 저장 오류를 덮어쓰지 않게 합니다.
      return false;
    }
  };

  operations.reportSleepReminderSaveFailure = (revision: number) => {
    context.sleepReminderFailureSaveRevisionRef.current = revision;
    if (context.mountedRef.current && context.saveRevisionRef.current === revision) {
      operations.reportSaveIssue('sleep-reminder-sync-failed', SLEEP_REMINDER_SYNC_SAVE_ERROR);
    }
  };

  operations.retrySleepReminderSync = async () => {
    const session = context.sessionRevisionRef.current;
    if (!context.readyRef.current) return false;
    return context.mutationCoordinator.run(async () => {
      const revision = context.saveRevisionRef.current;
      const synced = await operations.syncSleepRemindersForSnapshot(context.dataRef.current, true);
      if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
        return false;
      if (!synced) {
        operations.reportSleepReminderSaveFailure(revision);
      }
      return synced;
    });
  };

  operations.getAlarmStatus = () => context.runtime.readAlarmStatus();

  operations.requestAlarmAccess = async () => {
    const status = await context.runtime.requestAlarmPermissions();
    return (
      status.supported &&
      status.exactAlarmAllowed &&
      status.fullScreenAllowed &&
      status.notificationsAllowed
    );
  };

  operations.resyncAlarms = async (force = false) => {
    const session = context.sessionRevisionRef.current;
    if (!context.readyRef.current) return false;
    if (context.alarmResumeSyncRef.current) return context.alarmResumeSyncRef.current;
    const task = context.mutationCoordinator.run(async () => {
      if (!context.readyRef.current || session !== context.sessionRevisionRef.current) return false;
      const snapshot = context.dataRef.current;
      const signature = getAlarmScheduleSignature(snapshot);
      const enforcedScheduleSafety = enforceAppDataScheduleSafety(snapshot, {
        mode: 'ingress',
      });
      const syncSnapshot = enforcedScheduleSafety.data ?? snapshot;
      const scheduleSafetyBlocked = !enforcedScheduleSafety.safety.canEnableAlarms;
      if (scheduleSafetyBlocked) operations.reportUnsafeAlarmSchedule(enforcedScheduleSafety);
      const retryPending = context.failedAlarmSyncSignatureRef.current === signature;
      const scheduleChanged =
        context.lastAlarmSyncSignatureRef.current !== null &&
        context.lastAlarmSyncSignatureRef.current !== signature;
      const syncCheckNow = context.runtime.now();
      let recentPlan: readonly AlarmPyoAlarmPlan[] | null = null;
      let repairNeeded = false;
      let alarmAccessMissing = false;
      let automaticRepairBlocked = false;
      if (context.mountedRef.current) {
        context.setAlarmAutoCheckState({ checkedAt: null, status: 'checking' });
      }
      try {
        const result = await runAlarmSyncCheck({
          skipStatusCheck:
            !scheduleSafetyBlocked &&
            !force &&
            !retryPending &&
            !scheduleChanged &&
            canSkipDisabledAlarmStatusCheck({
              notificationsEnabled: syncSnapshot.settings.notificationsEnabled,
              storedScheduledCount: syncSnapshot.settings.scheduledNotificationCount,
              lastSyncAt: syncSnapshot.settings.lastNotificationSyncAt,
            }),
          readStatus: () => context.runtime.readAlarmStatus(),
          createPlan: () =>
            buildAlarmPyoAlarmPlan(
              syncSnapshot,
              (dateKey) => resolveShiftFromData(syncSnapshot, dateKey),
              {
                now: syncCheckNow,
                maxAlarms: MAX_NATIVE_SCHEDULED_ALARMS,
              },
            ),
          createSyncPlan: () =>
            buildAlarmPyoAlarmPlan(
              syncSnapshot,
              (dateKey) => resolveShiftFromData(syncSnapshot, dateKey),
              { now: syncCheckNow },
            ),
          shouldSynchronize: (status, plan) => {
            if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
              return false;
            alarmAccessMissing =
              status.supported &&
              (!status.exactAlarmAllowed ||
                !status.fullScreenAllowed ||
                !status.notificationsAllowed);
            automaticRepairBlocked = shouldBlockAutomaticAlarmRepair({
              exactAlarmAllowed: status.exactAlarmAllowed,
              notificationsAllowed: status.notificationsAllowed,
              notificationsEnabled: syncSnapshot.settings.notificationsEnabled,
              supported: status.supported,
            });
            const countSynchronized = isAlarmPyoAlarmScheduleSynchronized({
              actualScheduledCount: status.scheduledCount,
              exactAlarmAllowed: status.exactAlarmAllowed,
              notificationsAllowed: status.notificationsAllowed,
              plannedAlarmCount: plan.length,
            });
            const contentSynchronized = isAlarmPyoAlarmPlanContentSynchronized({
              actualScheduledAlarms: status.scheduledAlarms,
              exactAlarmAllowed: status.exactAlarmAllowed,
              notificationsAllowed: status.notificationsAllowed,
              plannedAlarms: plan,
            });
            repairNeeded = !automaticRepairBlocked && (!countSynchronized || !contentSynchronized);
            if (automaticRepairBlocked) return false;
            if (!contentSynchronized && !force && !retryPending && !scheduleChanged) {
              recentPlan ??= buildAlarmPyoAlarmPlan(
                syncSnapshot,
                (dateKey) => resolveShiftFromData(syncSnapshot, dateKey),
                {
                  now: new Date(syncCheckNow.getTime() - ALARM_DELIVERY_RETRY_GRACE_MS),
                  maxAlarms: MAX_NATIVE_SCHEDULED_ALARMS,
                },
              );
              if (
                canPreserveActiveAlarmDeliveryRetry({
                  actualScheduledAlarms: status.scheduledAlarms,
                  actualScheduledCount: status.scheduledCount,
                  exactAlarmAllowed: status.exactAlarmAllowed,
                  force,
                  notificationsAllowed: status.notificationsAllowed,
                  now: syncCheckNow,
                  plannedAlarms: plan,
                  recentPlannedAlarms: recentPlan,
                  retryPending,
                  scheduleChanged,
                })
              ) {
                return false;
              }
            }
            return shouldSyncAlarmPyoAlarmSnapshot({
              force,
              retryPending,
              scheduleChanged: scheduleChanged || !contentSynchronized,
              actualScheduledCount: status.scheduledCount,
              exactAlarmAllowed: status.exactAlarmAllowed,
              notificationsAllowed: status.notificationsAllowed,
              plannedAlarmCount: plan.length,
              storedScheduledCount: syncSnapshot.settings.scheduledNotificationCount,
              lastSyncAt: syncSnapshot.settings.lastNotificationSyncAt,
              now: syncCheckNow,
              previousTimeZoneOffset: context.lastTimeZoneOffsetRef.current,
            });
          },
          synchronize: (plan) =>
            operations.syncAlarmsForSnapshot(
              snapshot,
              plan,
              buildAlarmPyoAlarmSyncMetadata(syncCheckNow),
            ),
        });
        if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
          return false;
        if (!result.success) {
          if (context.mountedRef.current) {
            context.setAlarmAutoCheckState({
              checkedAt: syncCheckNow.toISOString(),
              status: 'error',
            });
          }
          return false;
        }
        if (!result.synchronized) {
          context.lastTimeZoneOffsetRef.current = context.runtime.now().getTimezoneOffset();
          context.lastAlarmSyncSignatureRef.current = signature;
          if (context.failedAlarmSyncSignatureRef.current === signature) {
            context.failedAlarmSyncSignatureRef.current = null;
          }
          if (
            automaticRepairBlocked &&
            result.status &&
            syncSnapshot.settings.scheduledNotificationCount !== result.status.scheduledCount
          ) {
            operations.updateData((current) => {
              if (getAlarmScheduleSignature(current) !== signature) return current;
              return withAlarmRuntimeState(
                current,
                result.status!.scheduledCount,
                syncCheckNow.toISOString(),
              );
            });
          }
        }
        if (context.mountedRef.current) {
          context.setAlarmAutoCheckState({
            checkedAt: syncCheckNow.toISOString(),
            status: resolveCompletedAlarmAutoCheckStatus({
              accessMissing: alarmAccessMissing,
              repairNeeded,
              success: true,
              synchronized: result.synchronized,
            }),
          });
        }
        return true;
      } catch {
        if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
          return false;
        context.failedAlarmSyncSignatureRef.current = signature;
        if (context.mountedRef.current) {
          context.setAlarmAutoCheckState({
            checkedAt: syncCheckNow.toISOString(),
            status: 'error',
          });
        }
        operations.reportAlarmSyncFailure(syncSnapshot.settings.notificationsEnabled);
        return false;
      }
    });
    context.alarmResumeSyncRef.current = task;
    try {
      return await task;
    } finally {
      if (context.alarmResumeSyncRef.current === task) context.alarmResumeSyncRef.current = null;
    }
  };

  operations.enableAlarms = async () => {
    const session = context.sessionRevisionRef.current;
    if (!context.readyRef.current) return false;
    const scheduleSafety = analyzeAppDataScheduleSafety(context.dataRef.current);
    if (!scheduleSafety.canEnableAlarms) {
      operations.reportAlarmEnableBlocked();
      return false;
    }
    const status = await context.runtime.requestAlarmPermissions();
    if (
      !status.supported ||
      !context.mountedRef.current ||
      session !== context.sessionRevisionRef.current
    )
      return false;
    // 사용자가 알람을 켜려는 의사와 Android 전달 권한의 준비 상태는 별개입니다.
    // 설정 화면에서 돌아오기 전의 권한 응답이 false여도 저장 실패로 표시하지 않고,
    // 알람 화면의 상태 카드가 다음으로 필요한 권한을 이어서 안내합니다.
    return context.mutationCoordinator.run(async () => {
      if (!context.readyRef.current || session !== context.sessionRevisionRef.current) return false;
      const current = context.dataRef.current;
      const candidate = {
        ...current,
        settings: { ...current.settings, notificationsEnabled: true },
      };
      const latestSafety = analyzeAppDataScheduleSafety(candidate);
      if (!latestSafety.canEnableAlarms) {
        const failClosed = enforceAppDataScheduleSafety(current, { mode: 'ingress' });
        if (failClosed.alarmsDisabled && failClosed.data) {
          await operations.replaceDataAndPersistInternal(failClosed.data, false, true);
        }
        operations.reportAlarmEnableBlocked();
        return false;
      }
      const saved = await operations.replaceDataAndPersistInternal(candidate);
      if (saved) {
        operations.clearReportedSaveIssue('invalid-work-schedule');
        operations.clearReportedSaveIssue('unsafe-alarm-schedule');
      }
      return saved;
    });
  };

  operations.disableAlarms = async () => {
    return context.mutationCoordinator.run(() =>
      operations.replaceDataAndPersistInternal(
        (current) => ({
          ...current,
          settings: {
            ...current.settings,
            notificationsEnabled: false,
            ...markAlarmDisableSyncPending(current.settings),
          },
        }),
        false,
        true,
      ),
    );
  };

  operations.setSleepReminderEnabled = async (enabled: boolean) => {
    const session = context.sessionRevisionRef.current;
    const saved = await operations.replaceDataAndPersist((current) => {
      if (current.settings.sleepReminderEnabled === enabled) return current;
      return {
        ...current,
        settings: {
          ...current.settings,
          sleepReminderEnabled: enabled,
        },
      };
    });
    if (!saved) return false;
    if (enabled) {
      await context.runtime.requestSleepReminderPermission().catch(() => undefined);
    }
    if (!context.mountedRef.current || session !== context.sessionRevisionRef.current) return false;
    // 알림 권한이 없어도 설정 저장은 성공입니다. 권한이 준비되면
    // 앱 복귀 동기화가 같은 14일 계획을 다시 전달합니다.
    await context.mutationCoordinator.run(() => {
      if (!context.readyRef.current || session !== context.sessionRevisionRef.current)
        return Promise.resolve(false);
      return operations.syncSleepRemindersForSnapshot(context.dataRef.current, true);
    });
    return true;
  };

  operations.sendTestAlarm = async () => {
    const session = context.sessionRevisionRef.current;
    const status = await context.runtime.requestAlarmPermissions();
    if (
      !context.mountedRef.current ||
      session !== context.sessionRevisionRef.current ||
      !status.supported ||
      !status.exactAlarmAllowed ||
      !status.fullScreenAllowed ||
      !status.notificationsAllowed
    ) {
      return false;
    }
    await context.platform.scheduleAlarmPyoTestAlarm(5);
    return true;
  };
}
