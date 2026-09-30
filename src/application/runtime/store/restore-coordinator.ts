import { getResetAllDataResult, type ResetAllDataResult } from '../../app-store-persistence';
import {
  enforceAppDataScheduleSafety,
  type EnforcedScheduleSafety,
} from '../../app-store-schedule-safety';
import type { LatestBackupRestoreResult } from '../../app-store-contract';
import type { AppData } from '../../../models/app-data';
import { createDefaultAppData, withoutAlarmRuntimeState } from '../../app-data-policy';
import type { AppDataImportPreview } from '../../app-data-codec-port';
import {
  applyWorkSettingsTransaction,
  type WorkSettingsSharePreview,
} from '../../../services/work-settings-share-service';
import { toDateKey } from '../../../utils/date';
import type { AppStoreEngineContext, AppStoreOperations } from './engine-context';

/** Restore operations share the engine transaction and state; they never own a second store. */
export function registerRestoreCoordinator(
  context: AppStoreEngineContext,
  operations: AppStoreOperations,
): void {
  operations.clearDeviceLocalDataForResetCleanup = async () => {
    await Promise.all([
      context.platform.clearPlayUpdatePromptSnooze(),
      context.platform.clearQuickSetupDraft(),
    ]);
  };

  operations.createBackupInternal = async () => {
    if (!context.readyRef.current) throw new Error('근무표를 모두 불러온 뒤 백업할 수 있습니다.');
    try {
      const backup = await context.storage.writeAutomaticBackup(context.dataRef.current);
      const deviceBackupSaved = await context.runtime.writeBackup(context.dataRef.current);
      if (!deviceBackupSaved) {
        throw new Error('기기 안전 백업 파일을 만들지 못했습니다.');
      }
      return backup;
    } catch {
      // 사용자가 시작한 백업은 호출한 화면에서 작업 맥락에 맞게 안내합니다.
      throw new Error(
        '안전 백업을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
      );
    }
  };

  operations.createBackup = () => {
    if (context.backupRequestRef.current !== null) return context.backupRequestRef.current;
    const running = context.mutationCoordinator.run(() => operations.createBackupInternal());
    const tracked = running.finally(() => {
      if (context.backupRequestRef.current === tracked) {
        context.backupRequestRef.current = null;
      }
    });
    context.backupRequestRef.current = tracked;
    return tracked;
  };

  operations.applySharedWorkSettings = async (preview: WorkSettingsSharePreview) => {
    if (!context.readyRef.current) {
      return { success: false, reason: 'not-ready' } as const;
    }
    const scheduleEnforcementRef: {
      current: EnforcedScheduleSafety | null;
    } = {
      current: null,
    };
    const result = await context.mutationCoordinator.run(() =>
      applyWorkSettingsTransaction({
        current: context.dataRef.current,
        preview,
        // 개인 일정에 영향을 주는 작업이므로 적용 직전의 전체 데이터를 안전 백업합니다.
        createSafetyBackup: operations.createBackupInternal,
        prepare: (next) => {
          // 공유 파일은 회사 근무 순서와 시간만 바꿉니다. 새 일정에서 당장
          // 사용할 수 없는 날짜별 개인 알람도 삭제하지 않고 보존하며, 실제
          // 예약 계산기는 적용 가능한 날짜에서만 해당 값을 사용합니다.
          scheduleEnforcementRef.current = enforceAppDataScheduleSafety(next);
          return scheduleEnforcementRef.current.data;
        },
        save: (next) => operations.replaceDataAndPersistInternal(next, false, true),
      }),
    );
    const scheduleEnforcement = scheduleEnforcementRef.current;
    if (scheduleEnforcement?.data === null) operations.reportInvalidWorkSchedule();
    if (result.success && scheduleEnforcement !== null) {
      operations.reportUnsafeAlarmSchedule(scheduleEnforcement);
    }
    return result;
  };

  operations.importData = async (preview: AppDataImportPreview) => {
    if (!context.readyRef.current) return false;
    let imported: AppData;
    try {
      // 예약 개수와 동기화 시각은 백업을 만든 휴대폰의 상태이므로 가져오지 않습니다.
      imported = withoutAlarmRuntimeState(context.codec.fromImportPreview(preview));
    } catch {
      throw new Error('가져올 근무표를 다시 확인해야 합니다.');
    }
    const scheduleEnforcement = enforceAppDataScheduleSafety(imported, {
      mode: 'ingress',
    });
    imported = scheduleEnforcement.data ?? imported;
    const importedSuccessfully = await context.mutationCoordinator.run(async () => {
      try {
        await operations.createBackupInternal();
      } catch {
        return false;
      }
      return operations.replaceDataAndPersistInternal(imported, false, true);
    });
    if (importedSuccessfully) operations.reportUnsafeAlarmSchedule(scheduleEnforcement);
    return importedSuccessfully;
  };

  operations.getLatestBackupPreview = async () => {
    const raw = await context.storage.readAutomaticBackup();
    return raw === null ? null : context.codec.previewImport(raw);
  };

  operations.getPendingRestoreBackupPreview = async () => {
    if (!context.readyRef.current) return null;
    const pending = await context.storage.readPendingRestore(
      operations.getPersistedDataForPendingRestore(),
    );
    if (pending === null) return null;
    return {
      ...context.codec.previewImport(pending.backup),
      recoveryState: pending.recoveryState,
    };
  };

  operations.retryPendingRestoreBackup = async (allowUnverified = false) => {
    if (!context.readyRef.current) return { status: 'unavailable' } as const;
    return context.mutationCoordinator.run(() =>
      context.storage.retryPendingRestore(operations.getPersistedDataForPendingRestore(), {
        allowUnverified,
      }),
    );
  };

  operations.getRecoveryBackupPreview = async () => {
    if (context.state.getSnapshot().loadFailureReason === 'recovery-required') {
      const raw = context.missingPrimaryRecoveryRawRef.current;
      return raw === null ? null : context.codec.previewImport(raw);
    }
    if (
      context.state.getSnapshot().loadFailureReason !== 'corrupt' ||
      context.state.getSnapshot().corruptBackupKey === null
    )
      return null;
    const raw = await context.storage.readRecoveryBackup();
    return raw === null ? null : context.codec.previewImport(raw);
  };

  operations.restoreRecoveryBackup = async () => {
    if (
      context.readyRef.current ||
      (context.state.getSnapshot().loadFailureReason !== 'recovery-required' &&
        (context.state.getSnapshot().loadFailureReason !== 'corrupt' ||
          context.state.getSnapshot().corruptBackupKey === null))
    ) {
      return false;
    }
    return context.mutationCoordinator.run(async () => {
      let preview: AppDataImportPreview | null;
      try {
        preview = await operations.getRecoveryBackupPreview();
      } catch {
        return false;
      }
      if (preview === null) return false;
      try {
        const restored = withoutAlarmRuntimeState(context.codec.fromImportPreview(preview));
        const enforced = enforceAppDataScheduleSafety(restored, { mode: 'ingress' });
        await context.storage.writePrimary(context.codec.serialize(enforced.data ?? restored));
        await context.storage.clearExplicitResetMarker().catch(() => undefined);
      } catch {
        return false;
      }
      return operations.loadData();
    });
  };

  operations.restoreLatestBackup = async (): Promise<LatestBackupRestoreResult> => {
    return context.mutationCoordinator.run(async () => {
      let preview: AppDataImportPreview | null;
      try {
        preview = await operations.getLatestBackupPreview();
      } catch {
        return { status: 'failure', reason: 'backup-unavailable' } as const;
      }
      if (preview === null) {
        return { status: 'failure', reason: 'backup-unavailable' } as const;
      }
      if (context.readyRef.current) {
        try {
          if (!(await context.storage.repairPendingRestore())) {
            return { status: 'failure', reason: 'protection-failed' } as const;
          }
          if (
            await context.storage.readPendingRestore(operations.getPersistedDataForPendingRestore())
          ) {
            return { status: 'partial', reason: 'backup-pending' } as const;
          }
        } catch {
          return { status: 'failure', reason: 'protection-failed' } as const;
        }
        let restored: AppData;
        let scheduleEnforcement: EnforcedScheduleSafety;
        try {
          restored = withoutAlarmRuntimeState(context.codec.fromImportPreview(preview));
          scheduleEnforcement = enforceAppDataScheduleSafety(restored, {
            mode: 'ingress',
          });
          restored = scheduleEnforcement.data ?? restored;
        } catch {
          return { status: 'failure', reason: 'backup-unavailable' } as const;
        }
        const transaction = await context.storage.restoreWithBackup(
          context.dataRef.current,
          restored,
          () => operations.replaceDataAndPersistDetailedInternal(restored, false, true),
        );
        if (!transaction.restoreStarted) {
          return { status: 'failure', reason: 'protection-failed' } as const;
        }
        if (!transaction.restoreResult?.operationSucceeded) {
          return { status: 'failure', reason: 'restore-failed' } as const;
        }
        operations.reportUnsafeAlarmSchedule(scheduleEnforcement);
        if (!transaction.automaticBackupSaved) {
          return { status: 'partial', reason: 'backup-pending' } as const;
        }
        if (transaction.restoreResult.partialFailure) {
          return { status: 'partial', reason: 'follow-up-failed' } as const;
        }
        return { status: 'success' } as const;
      }
      try {
        const restored = withoutAlarmRuntimeState(preview.data);
        const scheduleEnforcement = enforceAppDataScheduleSafety(restored, {
          mode: 'ingress',
        });
        await context.storage.writePrimary(
          context.codec.serialize(scheduleEnforcement.data ?? restored),
        );
      } catch {
        return { status: 'failure', reason: 'restore-failed' } as const;
      }
      return (await operations.loadData())
        ? ({ status: 'success' } as const)
        : ({ status: 'failure', reason: 'restore-failed' } as const);
    });
  };

  operations.startFreshAfterLoadError = async () => {
    if (
      context.readyRef.current ||
      (context.state.getSnapshot().loadFailureReason !== 'recovery-required' &&
        (context.state.getSnapshot().loadFailureReason !== 'corrupt' ||
          context.state.getSnapshot().corruptBackupKey === null))
    ) {
      return false;
    }
    return context.mutationCoordinator.run(async () => {
      try {
        await context.storage.writeExplicitResetMarker();
        context.explicitResetMarkerPendingRef.current = true;
        await context.storage.writePrimary(
          context.codec.serialize(createDefaultAppData(toDateKey(context.runtime.now()))),
        );
      } catch {
        await context.storage.clearExplicitResetMarker().catch(() => undefined);
        context.explicitResetMarkerPendingRef.current = false;
        return false;
      }
      return operations.loadData();
    });
  };

  operations.resetAllDataDetailed = async (): Promise<ResetAllDataResult> => {
    if (!context.readyRef.current) {
      return { status: 'failure', dataReset: false, reason: 'reset-failed' };
    }
    return context.mutationCoordinator.run(async () => {
      try {
        await operations.createBackupInternal();
      } catch {
        return { status: 'failure', dataReset: false, reason: 'backup-failed' } as const;
      }
      try {
        await context.storage.writeExplicitResetMarker();
        context.explicitResetMarkerPendingRef.current = true;
      } catch {
        return { status: 'failure', dataReset: false, reason: 'reset-failed' } as const;
      }
      const reset = await operations.replaceDataAndPersistDetailedInternal(
        createDefaultAppData(toDateKey(context.runtime.now())),
        false,
        true,
        async (snapshot) => {
          const cleanup = await context.platform.resumeResetCleanupJournal({
            persistedSnapshot: snapshot,
            resetAlarmRuntime: context.platform.resetAlarmRuntimeForResetCleanup,
            cancelTimer: context.platform.cancelQuickTimerForResetCleanup,
            clearDeviceLocalData: operations.clearDeviceLocalDataForResetCleanup,
          });
          if (!cleanup.completed) {
            throw new Error('초기화 후속 정리를 완료하지 못했습니다.');
          }
        },
        (snapshot) => context.platform.prepareResetCleanupJournal(snapshot),
      );
      const result = getResetAllDataResult(reset);
      if (!result.dataReset) {
        await context.platform.clearResetCleanupJournal().catch(() => undefined);
        await context.storage.clearExplicitResetMarker().catch(() => undefined);
        context.explicitResetMarkerPendingRef.current = false;
      }
      return result;
    });
  };

  operations.resetAllData = async () => {
    const result = await operations.resetAllDataDetailed();
    return result.status === 'success';
  };
}
