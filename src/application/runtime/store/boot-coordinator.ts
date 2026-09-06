import { canRecoverAppDataFromSafetyBackup } from './storage-port';
import { getAutomaticSaveContentSignature } from '../../app-store-persistence';
import { enforceAppDataScheduleSafety } from '../../app-store-schedule-safety';
import { createSavedOutcome } from '../../save-outcome';
import { createDefaultAppData } from '../../app-data-policy';
import { toDateKey } from '../../../utils/date';
import type { AppStoreEngineContext, AppStoreOperations } from './engine-context';

/** Boot operations share the engine transaction and state; they never own a second store. */
export function registerBootCoordinator(
  context: AppStoreEngineContext,
  operations: AppStoreOperations,
): void {
  operations.loadData = async () => {
    const attempt = context.loadAttemptRef.current + 1;
    context.loadAttemptRef.current = attempt;
    context.readyRef.current = false;
    context.setReady(false);
    context.setLoadError(null);
    context.setLoadFailureReason(null);
    context.setCorruptBackupKey(null);
    context.setSaveStatus('idle');
    context.setSaveOutcome(null);
    context.setSaveError(null);
    context.setAlarmSyncStatus('idle');
    context.setAlarmSyncError(null);
    context.setSleepReminderSyncStatus('idle');
    context.setSleepReminderSyncError(null);
    context.setAlarmAutoCheckState({ checkedAt: null, status: 'idle' });
    context.lastKnownGoodSnapshotRef.current = null;
    context.missingPrimaryRecoveryRawRef.current = null;
    context.explicitResetMarkerPendingRef.current = false;
    context.lastAlarmSyncSignatureRef.current = null;
    context.failedAlarmSyncSignatureRef.current = null;
    context.lastSleepReminderSyncSignatureRef.current = null;
    context.lastSleepReminderProjectionKeyRef.current = null;
    context.failedSleepReminderSyncSignatureRef.current = null;
    context.sleepReminderSyncAttemptRef.current += 1;
    context.sleepReminderFailureSaveRevisionRef.current = null;
    context.saveOutcomeRef.current = null;
    context.lastPersistedAutomaticSaveSignatureRef.current = null;
    let result = await context.storage.load(
      createDefaultAppData(toDateKey(context.runtime.now())),
      context.runtime.now(),
    );
    let deviceBackup: Awaited<ReturnType<typeof context.runtime.readLatestBackup>> = null;
    const shouldInspectDeviceBackup =
      (result.ok && result.source === 'empty') ||
      (!result.ok && (result.reason === 'corrupt' || result.reason === 'recovery-required'));
    if (shouldInspectDeviceBackup) {
      try {
        deviceBackup = await context.runtime.readLatestBackup();
      } catch {
        // 독립 파일 백업을 읽지 못해도 AsyncStorage의 정상 백업을 계속 확인합니다.
      }
    }
    if (
      deviceBackup &&
      ((result.ok && result.source === 'empty') ||
        (!result.ok && result.reason === 'recovery-required'))
    ) {
      const deviceBackupRaw = deviceBackup.exportedAt
        ? context.codec.export(deviceBackup.data, new Date(deviceBackup.exportedAt))
        : context.codec.serialize(deviceBackup.data);
      result = await context.storage.load(
        createDefaultAppData(toDateKey(context.runtime.now())),
        context.runtime.now(),
        {
          missingPrimaryRecoveryCandidates: [{ raw: deviceBackupRaw, source: 'device-safety' }],
        },
      );
    }
    let recoveredFromDeviceBackup = false;
    if (canRecoverAppDataFromSafetyBackup(result)) {
      try {
        if (deviceBackup) {
          const recoveredSnapshot = context.codec.serialize(deviceBackup.data);
          await context.storage.writePrimary(recoveredSnapshot);
          result = await context.storage.load(
            createDefaultAppData(toDateKey(context.runtime.now())),
            context.runtime.now(),
          );
          recoveredFromDeviceBackup = result.ok;
          if (recoveredFromDeviceBackup) {
            try {
              await context.storage.writeLastKnownGood(recoveredSnapshot);
            } catch {
              // 본문 복구가 끝났다면 최근 정상 저장본 갱신 실패로 복구를 되돌리지 않습니다.
            }
          }
        }
      } catch {
        // 기기 파일 백업을 읽거나 복구하지 못하면 보존한 손상 원본과 복구 화면을 유지합니다.
      }
    }
    const matchingLastKnownGoodSnapshot = result.ok
      ? await context.storage.findMatchingLastKnownGood(result.persistedSnapshot)
      : null;
    const explicitResetMarkerPending = result.ok
      ? result.source === 'reset' ||
        (await context.storage.hasExplicitResetMarker().catch(() => false))
      : false;
    if (!context.mountedRef.current || context.loadAttemptRef.current !== attempt) return false;
    let resetCleanupCompleted = true;
    if (result.ok) {
      await context.storage.reconcilePendingRestore(result.data);
      try {
        const cleanup = await context.platform.resumeResetCleanupJournal({
          persistedSnapshot: result.persistedSnapshot,
          resetFallbackLoaded: result.source === 'reset',
          resetAlarmRuntime: context.platform.resetAlarmRuntimeForResetCleanup,
          cancelTimer: context.platform.cancelQuickTimerForResetCleanup,
          clearDeviceLocalData: operations.clearDeviceLocalDataForResetCleanup,
        });
        resetCleanupCompleted = cleanup.completed;
      } catch {
        resetCleanupCompleted = false;
      }
    }
    if (!context.mountedRef.current || context.loadAttemptRef.current !== attempt) return false;
    if (!result.ok) {
      if (result.reason === 'recovery-required') {
        context.missingPrimaryRecoveryRawRef.current = result.recovery.raw;
      }
      context.setLoadError(result.error);
      context.setLoadFailureReason(result.reason);
      context.setCorruptBackupKey(result.corruptBackupKey);
      return false;
    }
    const loadedScheduleSafety = enforceAppDataScheduleSafety(result.data, {
      mode: 'ingress',
    });
    const loadedData = loadedScheduleSafety.data ?? result.data;
    context.lastPersistedAutomaticSaveSignatureRef.current = getAutomaticSaveContentSignature(
      result.data,
    );
    context.dataRef.current = loadedData;
    context.explicitResetMarkerPendingRef.current = explicitResetMarkerPending;
    context.storage.setPersistedValue(result.persistedSnapshot);
    context.lastKnownGoodSnapshotRef.current = matchingLastKnownGoodSnapshot;
    context.setData(loadedData);
    context.readyRef.current = true;
    context.setReady(true);
    context.setSaveStatus(
      recoveredFromDeviceBackup || result.source === 'stored' ? 'saved' : 'idle',
    );
    if (recoveredFromDeviceBackup || result.source === 'stored') {
      const outcome = createSavedOutcome();
      context.saveOutcomeRef.current = outcome;
      context.setSaveOutcome(outcome);
    }
    if (recoveredFromDeviceBackup) {
      context.setSaveSuccessRevision((current) => current + 1);
    }
    if (!resetCleanupCompleted) {
      operations.reportSaveIssue(
        'reset-marker-cleanup-failed',
        '자료는 초기화되었지만 알람 또는 기기 설정 정리가 남았습니다. 앱을 다시 열면 자동으로 재시도합니다.',
      );
    }
    operations.reportUnsafeAlarmSchedule(loadedScheduleSafety);
    return true;
  };

  operations.retryLoad = () => context.mutationCoordinator.run(() => operations.loadData());
}
