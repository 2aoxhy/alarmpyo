import { getSnapshotPersistenceOutcome } from '../../persistence-outcomes';
import {
  applyCanonicalSnapshotIfSourceIsCurrent,
  createDataReplacementResult,
  getAutomaticSaveContentSignature,
  persistLatestCanonicalSnapshotAndSyncSleep,
  shouldFlushAutomaticSave,
  shouldSkipEquivalentExplicitSave,
  shouldSyncAlarmsAfterReplacement,
  shouldSyncSleepRemindersAfterReplacement,
  type DataReplacementResult,
  withDeviceBackupResult,
} from '../../app-store-persistence';
import { type EnforcedScheduleSafety } from '../../app-store-schedule-safety';
import type { SaveIssueCode, SaveOutcome, SaveRetryAction } from '../../app-store-contract';
import { clearSaveIssue, clearSaveIssuesByRetryAction, mergeSaveIssue } from '../../save-outcome';
import type { AppData } from '../../../models/app-data';
import type { AppStoreEngineContext, AppStoreOperations } from './engine-context';

/** Persistence operations share the engine transaction and state; they never own a second store. */
export function registerPersistenceCoordinator(
  context: AppStoreEngineContext,
  operations: AppStoreOperations,
): void {
  operations.recordSaveOutcome = (outcome: SaveOutcome | null) => {
    context.saveOutcomeRef.current = outcome;
    if (!context.mountedRef.current) return;
    context.setSaveOutcome(outcome);
    context.setSaveError(outcome !== null && outcome.status !== 'success' ? outcome.message : null);
  };

  operations.reportSaveIssue = (issueCode: SaveIssueCode, message: string) => {
    const outcome = mergeSaveIssue(context.saveOutcomeRef.current, issueCode, message);
    operations.recordSaveOutcome(outcome);
    if (context.mountedRef.current) context.setSaveStatus('error');
  };

  operations.clearReportedSaveIssue = (issueCode: SaveIssueCode) => {
    const current = context.saveOutcomeRef.current;
    if (!current?.issues.some((issue) => issue.issueCode === issueCode)) return;
    const outcome = clearSaveIssue(current, issueCode);
    operations.recordSaveOutcome(outcome);
    if (context.mountedRef.current) {
      context.setSaveStatus(outcome.status === 'success' ? 'saved' : 'error');
    }
  };

  operations.reportUnsafeAlarmSchedule = (enforced: EnforcedScheduleSafety) => {
    if (enforced.safety.canEnableAlarms) {
      operations.clearReportedSaveIssue('unsafe-alarm-schedule');
      operations.clearReportedSaveIssue('invalid-work-schedule');
      return;
    }
    const hasUnsupportedShift = enforced.safety.unsupportedShiftTypeIds.length > 0;
    operations.reportSaveIssue(
      'unsafe-alarm-schedule',
      hasUnsupportedShift
        ? '자료는 보존했지만 이전 형식의 근무가 포함되어 근무 알람을 껐습니다. 근무 방식을 다시 확인해야 합니다.'
        : '자료는 저장되었지만 이전 근무 중 알람이 울릴 수 있어 근무 알람을 껐습니다. 근무 시간과 순서를 확인한 뒤 알람을 다시 켜야 합니다.',
    );
  };

  operations.reportInvalidWorkSchedule = () => {
    operations.reportSaveIssue(
      'invalid-work-schedule',
      '근무 시간이 이전 일정과 겹치거나 올바르지 않아 저장하지 못했습니다. 근무 시간과 순서를 확인해야 합니다.',
    );
  };

  operations.reportAlarmEnableBlocked = () => {
    operations.reportSaveIssue(
      'invalid-work-schedule',
      '이전 근무 중 알람이 울리거나 근무 시간이 겹칠 수 있어 알람을 켜지 않았습니다. 근무 시간과 순서를 먼저 확인해야 합니다.',
    );
  };

  operations.finalizeScheduleMutation = (
    enforced: EnforcedScheduleSafety | null,
    saved: boolean,
  ): boolean => {
    if (enforced === null || enforced.data === null) {
      operations.reportInvalidWorkSchedule();
      return false;
    }
    if (!saved) return false;
    operations.reportUnsafeAlarmSchedule(enforced);
    return true;
  };

  operations.clearReportedSaveIssues = (retryAction: SaveRetryAction, markSaved = false) => {
    const current = context.saveOutcomeRef.current;
    if (!markSaved && !current?.issues.some((issue) => issue.retryAction === retryAction)) {
      return;
    }
    const outcome = clearSaveIssuesByRetryAction(current, retryAction);
    operations.recordSaveOutcome(outcome);
    if (context.mountedRef.current) {
      context.setSaveStatus(outcome.status === 'success' ? 'saved' : 'error');
    }
  };

  operations.reportSaveSuccess = () => {
    operations.clearReportedSaveIssues('retry-save', true);
  };

  operations.getPersistedDataForPendingRestore = (): AppData => {
    const persistedSnapshot = context.storage.getPersistedValue();
    if (persistedSnapshot === null) return context.dataRef.current;
    const parsed = context.codec.tryParse(persistedSnapshot);
    return parsed.ok ? parsed.value.data : context.dataRef.current;
  };

  operations.updateData = (update: (current: AppData) => AppData): boolean => {
    if (!context.readyRef.current) return false;
    const current = context.dataRef.current;
    const next = update(current);
    if (Object.is(next, current)) return true;
    context.dataRef.current = next;
    context.setData(next);
    return true;
  };

  operations.persistSnapshot = async (
    snapshot: string,
    force = false,
    announceSuccess = false,
    canonicalData?: AppData,
  ) => {
    const session = context.sessionRevisionRef.current;
    if (!context.readyRef.current) {
      return {
        ...getSnapshotPersistenceOutcome(false, false),
        deviceBackupSaved: false,
      };
    }
    const previousSnapshot = context.storage.getPersistedValue();
    if (previousSnapshot !== null && previousSnapshot !== snapshot) {
      const previous = context.codec.tryParse(previousSnapshot);
      const next = context.codec.tryParse(snapshot);
      let pendingRestoreProtected = false;
      if (previous.ok && next.ok) {
        try {
          pendingRestoreProtected = await context.storage.protectPendingRestore(
            previous.value.data,
            next.value.data,
          );
        } catch {
          pendingRestoreProtected = false;
        }
      }
      if (!pendingRestoreProtected) {
        if (context.mountedRef.current && session === context.sessionRevisionRef.current) {
          operations.reportSaveIssue(
            'restore-protection-failed',
            '복원 전 원본 백업을 아직 안전하게 보호하지 못했습니다. 저장 공간을 확인한 뒤 다시 저장해야 합니다.',
          );
        }
        return {
          ...getSnapshotPersistenceOutcome(false, false),
          deviceBackupSaved: false,
          persistedSnapshot: previousSnapshot,
          lastKnownGoodSnapshot: context.lastKnownGoodSnapshotRef.current,
        };
      }
    }
    const revision = context.saveRevisionRef.current + 1;
    context.saveRevisionRef.current = revision;
    if (context.mountedRef.current && session === context.sessionRevisionRef.current) {
      operations.recordSaveOutcome(
        clearSaveIssuesByRetryAction(context.saveOutcomeRef.current, 'retry-save'),
      );
      context.setSaveStatus('saving');
    }
    const outcome = await context.storage.persistSnapshot(
      snapshot,
      context.lastKnownGoodSnapshotRef.current,
      { force },
    );
    context.lastKnownGoodSnapshotRef.current = outcome.lastKnownGoodSnapshot;
    const parsedSnapshot = canonicalData === undefined ? context.codec.tryParse(snapshot) : null;
    const savedData = canonicalData ?? (parsedSnapshot?.ok ? parsedSnapshot.value.data : null);
    if (outcome.primarySaved && savedData !== null) {
      context.lastPersistedAutomaticSaveSignatureRef.current =
        getAutomaticSaveContentSignature(savedData);
      if (context.automaticSaveTimerRef.current !== null) {
        clearTimeout(context.automaticSaveTimerRef.current);
        context.automaticSaveTimerRef.current = null;
      }
    }
    if (!outcome.operationSucceeded || outcome.partialFailure) {
      if (
        context.mountedRef.current &&
        context.saveRevisionRef.current === revision &&
        session === context.sessionRevisionRef.current
      ) {
        operations.reportSaveIssue(
          outcome.primarySaved ? 'safety-backup-failed' : 'primary-save-failed',
          outcome.primarySaved
            ? '근무표는 저장되었지만 안전 백업을 만들지 못했습니다. 다시 시도해야 합니다.'
            : '변경 내용을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
        );
      }
      // 본문 저장이 끝났다면 화면 상태도 같은 값으로 맞춥니다.
      // 안전 복사본 실패는 오류 배너로 알리되, 재실행 전후의 자료가 달라지지 않게 합니다.
      return { ...outcome, deviceBackupSaved: false };
    }
    let deviceBackupSaved = false;
    let resetMarkerCleared = true;
    if (savedData !== null) {
      try {
        deviceBackupSaved = await context.runtime.writeBackup(savedData);
      } catch {
        deviceBackupSaved = false;
      }
      if (savedData.settings.setupCompleted && context.explicitResetMarkerPendingRef.current) {
        try {
          await context.storage.clearExplicitResetMarker();
          context.explicitResetMarkerPendingRef.current = false;
        } catch {
          resetMarkerCleared = false;
        }
      }
    }
    const followUpSaved = deviceBackupSaved && resetMarkerCleared;
    if (
      context.mountedRef.current &&
      context.saveRevisionRef.current === revision &&
      session === context.sessionRevisionRef.current
    ) {
      if (followUpSaved) {
        operations.reportSaveSuccess();
      } else {
        if (!deviceBackupSaved) {
          operations.reportSaveIssue(
            'device-backup-failed',
            '근무표는 저장되었지만 기기 안전 백업 파일을 갱신하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
          );
        }
        if (!resetMarkerCleared) {
          operations.reportSaveIssue(
            'reset-marker-cleanup-failed',
            '근무표는 저장되었지만 초기화 상태를 정리하지 못했습니다. 다시 시도해야 합니다.',
          );
        }
      }
      if (announceSuccess && outcome.announceSuccess && followUpSaved) {
        context.setSaveSuccessRevision((current) => current + 1);
      }
    }
    return withDeviceBackupResult(outcome, followUpSaved);
  };

  operations.flushAutomaticSave = (generation: number) => {
    const session = context.sessionRevisionRef.current;
    if (
      generation !== context.automaticSaveGenerationRef.current ||
      !context.readyRef.current ||
      !shouldFlushAutomaticSave(
        getAutomaticSaveContentSignature(context.dataRef.current),
        context.lastPersistedAutomaticSaveSignatureRef.current,
      )
    ) {
      return Promise.resolve(true);
    }
    return context.mutationCoordinator.run(async () => {
      try {
        if (
          generation !== context.automaticSaveGenerationRef.current ||
          !context.readyRef.current ||
          !shouldFlushAutomaticSave(
            getAutomaticSaveContentSignature(context.dataRef.current),
            context.lastPersistedAutomaticSaveSignatureRef.current,
          )
        ) {
          return true;
        }
        // 실행 시점의 최신 상태를 직렬화해 지연된 자동 저장이
        // 이후에 저장한 근무표를 덮어쓰지 않게 합니다.
        let sourceSnapshot: AppData | null = null;
        const result = await persistLatestCanonicalSnapshotAndSyncSleep({
          getLatestCanonicalSnapshot: () => {
            sourceSnapshot = context.dataRef.current;
            return context.codec.canonicalize(sourceSnapshot);
          },
          persist: (canonicalData) =>
            operations.persistSnapshot(JSON.stringify(canonicalData), false, false, canonicalData),
          isPersistenceComplete: (persistence) =>
            persistence.operationSucceeded && !persistence.partialFailure,
          syncSleepReminders: (snapshot) =>
            session === context.sessionRevisionRef.current
              ? operations.syncSleepRemindersForSnapshot(snapshot)
              : Promise.resolve(false),
        });
        if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
          return false;
        if (
          result.persistence.primarySaved &&
          sourceSnapshot !== null &&
          context.mountedRef.current &&
          context.readyRef.current
        ) {
          applyCanonicalSnapshotIfSourceIsCurrent({
            sourceSnapshot,
            canonicalSnapshot: result.canonicalSnapshot,
            getCurrentSnapshot: () => context.dataRef.current,
            applyCanonicalSnapshot: (canonicalSnapshot) => {
              context.automaticSaveAppliedCanonicalSnapshotRef.current = canonicalSnapshot;
              context.dataRef.current = canonicalSnapshot;
              context.setData(canonicalSnapshot);
            },
          });
        }
        if (result.sleepReminderSyncSucceeded === null) return false;
        const persistenceRevision = context.saveRevisionRef.current;
        const { sleepReminderSyncSucceeded } = result;
        if (!sleepReminderSyncSucceeded) {
          operations.reportSleepReminderSaveFailure(persistenceRevision);
        }
        return sleepReminderSyncSucceeded;
      } catch {
        if (context.mountedRef.current && session === context.sessionRevisionRef.current) {
          operations.reportSaveIssue(
            'invalid-data',
            '변경 내용의 형식이 올바르지 않아 저장하지 못했습니다.',
          );
        }
        return false;
      }
    });
  };

  operations.retrySave = async () => {
    const session = context.sessionRevisionRef.current;
    if (!context.readyRef.current) return false;
    try {
      return await context.mutationCoordinator.run(async () => {
        const snapshot = context.codec.canonicalize(context.dataRef.current);
        const persisted = await operations.persistSnapshot(
          JSON.stringify(snapshot),
          true,
          false,
          snapshot,
        );
        if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
          return false;
        if (!persisted.operationSucceeded || persisted.partialFailure) return false;
        const persistenceRevision = context.saveRevisionRef.current;
        operations.updateData(() => snapshot);
        const sleepReminderSyncSucceeded = await operations.syncSleepRemindersForSnapshot(
          snapshot,
          true,
        );
        if (!context.mountedRef.current || session !== context.sessionRevisionRef.current)
          return false;
        if (!sleepReminderSyncSucceeded) {
          operations.reportSleepReminderSaveFailure(persistenceRevision);
          context.automaticSaveGenerationRef.current += 1;
          return false;
        }
        if (context.mountedRef.current) context.setSaveSuccessRevision((current) => current + 1);
        return true;
      });
    } catch {
      if (context.mountedRef.current && session === context.sessionRevisionRef.current) {
        operations.reportSaveIssue(
          'invalid-data',
          '변경 내용의 형식이 올바르지 않아 저장하지 못했습니다.',
        );
      }
      return false;
    }
  };

  operations.replaceDataAndPersistDetailedInternal = async (
    replacement: AppData | ((current: AppData) => AppData),
    announceSuccess = false,
    forceAlarmSync = false,
    afterPrimarySaveBeforeApply?: (snapshot: string) => Promise<void>,
    beforePrimarySave?: (snapshot: string) => Promise<void>,
  ): Promise<DataReplacementResult> => {
    const session = context.sessionRevisionRef.current;
    const current = context.dataRef.current;
    const replacementData = typeof replacement === 'function' ? replacement(current) : replacement;
    if (Object.is(replacementData, current)) {
      return createDataReplacementResult({
        primarySaved: true,
        dataApplied: true,
        followUpSucceeded: true,
      });
    }
    let next: AppData;
    let snapshot: string;
    try {
      next = context.codec.canonicalize(replacementData);
      snapshot = JSON.stringify(next);
    } catch {
      if (context.mountedRef.current) {
        operations.reportSaveIssue(
          'invalid-data',
          '변경 내용의 형식이 올바르지 않아 저장하지 못했습니다.',
        );
      }
      return createDataReplacementResult({
        primarySaved: false,
        dataApplied: false,
        followUpSucceeded: false,
      });
    }
    if (
      shouldSkipEquivalentExplicitSave({
        currentSnapshot: JSON.stringify(context.codec.canonicalize(current)),
        nextSnapshot: snapshot,
        forceAlarmSync,
        hasPersistenceCallback:
          beforePrimarySave !== undefined || afterPrimarySaveBeforeApply !== undefined,
        hasPendingSaveRetry: Boolean(
          context.saveOutcomeRef.current?.issues.some(
            (issue) => issue.retryAction === 'retry-save',
          ),
        ),
      })
    ) {
      return createDataReplacementResult({
        primarySaved: true,
        dataApplied: true,
        followUpSucceeded: true,
      });
    }
    if (beforePrimarySave) {
      try {
        await beforePrimarySave(snapshot);
      } catch {
        return createDataReplacementResult({
          primarySaved: false,
          dataApplied: false,
          followUpSucceeded: false,
        });
      }
    }
    context.automaticSaveGenerationRef.current += 1;
    const persisted = await operations.persistSnapshot(snapshot, true, false, next);
    if (!persisted.primarySaved) {
      return createDataReplacementResult({
        primarySaved: false,
        dataApplied: false,
        followUpSucceeded: false,
      });
    }
    let preApplyFollowUpSucceeded = true;
    if (afterPrimarySaveBeforeApply) {
      try {
        await afterPrimarySaveBeforeApply(snapshot);
      } catch {
        preApplyFollowUpSucceeded = false;
      }
    }
    const dataApplied =
      session === context.sessionRevisionRef.current && operations.updateData(() => next);
    if (!dataApplied) {
      return createDataReplacementResult({
        primarySaved: true,
        dataApplied: false,
        followUpSucceeded: false,
      });
    }
    const alarmSyncRequired = shouldSyncAlarmsAfterReplacement({
      current,
      next,
      failedSignature: context.failedAlarmSyncSignatureRef.current,
      force: forceAlarmSync,
    });
    const sleepReminderSyncRequired = shouldSyncSleepRemindersAfterReplacement({
      current,
      next,
      lastSyncedSignature: context.lastSleepReminderSyncSignatureRef.current,
      failedSignature: context.failedSleepReminderSyncSignatureRef.current,
      force: forceAlarmSync,
    });
    const sleepReminderSyncSucceeded =
      !sleepReminderSyncRequired || (await operations.syncSleepRemindersForSnapshot(next));
    if (!context.mountedRef.current || session !== context.sessionRevisionRef.current) {
      return createDataReplacementResult({
        primarySaved: true,
        dataApplied: false,
        followUpSucceeded: false,
      });
    }
    const alarmSyncSucceeded = !alarmSyncRequired || (await operations.syncAlarmsForSnapshot(next));
    if (!context.mountedRef.current || session !== context.sessionRevisionRef.current) {
      return createDataReplacementResult({
        primarySaved: true,
        dataApplied: false,
        followUpSucceeded: false,
      });
    }
    const persistenceFollowUpSucceeded =
      persisted.lastKnownGoodSaved && persisted.deviceBackupSaved;
    if (!sleepReminderSyncSucceeded) {
      operations.reportSleepReminderSaveFailure(context.saveRevisionRef.current);
    }
    if (!preApplyFollowUpSucceeded) {
      operations.reportSaveIssue(
        'reset-marker-cleanup-failed',
        '자료는 저장되었지만 초기 설정 임시 상태를 정리하지 못했습니다. 다시 시도해야 합니다.',
      );
    }
    const outcome = createDataReplacementResult({
      primarySaved: true,
      dataApplied: true,
      followUpSucceeded:
        preApplyFollowUpSucceeded &&
        persistenceFollowUpSucceeded &&
        alarmSyncSucceeded &&
        sleepReminderSyncSucceeded,
    });
    if (outcome.partialFailure) {
      // 상태 갱신으로 이미 예약된 자동 저장이 부분 실패 오류를
      // 곧바로 성공 상태로 덮어쓰지 않게 합니다.
      context.automaticSaveGenerationRef.current += 1;
    }
    if (announceSuccess && outcome.announceSuccess && context.mountedRef.current) {
      context.setSaveSuccessRevision((value) => value + 1);
    }
    return outcome;
  };

  operations.replaceDataAndPersistInternal = async (
    replacement: AppData | ((current: AppData) => AppData),
    announceSuccess = false,
    forceAlarmSync = false,
  ) => {
    const result = await operations.replaceDataAndPersistDetailedInternal(
      replacement,
      announceSuccess,
      forceAlarmSync,
    );
    return result.operationSucceeded;
  };

  operations.replaceDataAndPersist = (
    replacement: AppData | ((current: AppData) => AppData),
    announceSuccess = false,
  ) =>
    context.mutationCoordinator.run(() =>
      operations.replaceDataAndPersistInternal(replacement, announceSuccess),
    );
}
