import { enforceAppDataScheduleSafety } from '../../app-store-schedule-safety';
import type { AppData } from '../../../models/app-data';
import { getAlarmScheduleSignature } from '../../../services/alarm-schedule-signature';
import { getSleepReminderScheduleSignature } from '../../../services/sleep-reminder-planner';
import {
  buildPatternApplicationMutation,
  buildPatternRollbackMutation,
  createUserPatternId,
  deletePatternMutation,
  importValidatedPatternMutation,
  previewPatternApplication as previewPatternApplicationForData,
  runPatternPersistenceTransaction,
  saveUserPatternMutation,
  type PatternApplicationInput,
  type PatternApplyResult,
  type PatternRollbackResult,
  type PatternVaultSaveResult,
  type UserPatternInput,
} from '../../../services/pattern-vault-service';
import type { ValidatedPatternDescriptor } from '../../../services/shift-pattern-schema';
import type { AppStoreEngineContext, AppStoreOperations } from './engine-context';

/** Pattern operations share the engine transaction and state; they never own a second store. */
export function registerPatternCoordinator(
  context: AppStoreEngineContext,
  operations: AppStoreOperations,
): void {
  operations.saveUserPattern = async (input: UserPatternInput): Promise<PatternVaultSaveResult> => {
    if (!context.readyRef.current) {
      return { status: 'failure', reason: 'not-ready' };
    }
    const now = context.runtime.now();
    const id = input.id ?? createUserPatternId(now, Math.random().toString(36).slice(2));
    const mutationRef: {
      current: ReturnType<typeof saveUserPatternMutation> | null;
    } = { current: null };
    const saved = await operations.replaceDataAndPersist((current) => {
      mutationRef.current = saveUserPatternMutation(current, { ...input, id }, now);
      return mutationRef.current.status === 'failure' ? current : mutationRef.current.data;
    });
    const mutation = mutationRef.current;
    if (mutation === null || mutation.status === 'failure') {
      return {
        status: 'failure',
        reason: mutation?.reason ?? 'invalid-pattern',
      };
    }
    if (mutation.status === 'unchanged') {
      return { status: 'unchanged', patternId: mutation.patternId };
    }
    if (!saved) return { status: 'failure', reason: 'storage-failed' };
    return {
      status: 'saved',
      patternId: mutation.patternId,
      created: mutation.created,
    };
  };

  operations.importValidatedPattern = async (
    descriptor: ValidatedPatternDescriptor,
  ): Promise<PatternVaultSaveResult> => {
    if (!context.readyRef.current) {
      return { status: 'failure', reason: 'not-ready' };
    }
    const now = context.runtime.now();
    const mutationRef: {
      current: ReturnType<typeof importValidatedPatternMutation> | null;
    } = { current: null };
    const saved = await operations.replaceDataAndPersist((current) => {
      mutationRef.current = importValidatedPatternMutation(current, descriptor, now);
      return mutationRef.current.status === 'failure' ? current : mutationRef.current.data;
    });
    const mutation = mutationRef.current;
    if (mutation === null || mutation.status === 'failure') {
      return {
        status: 'failure',
        reason: mutation?.reason ?? 'invalid-pattern',
      };
    }
    if (mutation.status === 'unchanged') {
      return { status: 'unchanged', patternId: mutation.patternId };
    }
    if (!saved) return { status: 'failure', reason: 'storage-failed' };
    return {
      status: 'saved',
      patternId: mutation.patternId,
      created: mutation.created,
    };
  };

  operations.deletePattern = async (patternId: string) => {
    if (!context.readyRef.current) {
      return { status: 'failure', reason: 'not-ready' } as const;
    }
    return context.mutationCoordinator.run(async () => {
      const current = context.dataRef.current;
      const mutation = deletePatternMutation(current, patternId);
      if (mutation.status === 'not-found') return { status: 'not-found', patternId } as const;
      const candidateAlarmSignature = getAlarmScheduleSignature(mutation.data);
      const candidateSleepSignature = getSleepReminderScheduleSignature(mutation.data);
      const persisted = await runPatternPersistenceTransaction({
        createSafetyBackup: async () => {
          await context.storage.writeAutomaticBackup(current);
          if (!(await context.runtime.writeBackup(current))) {
            throw new Error('device-backup-failed');
          }
        },
        persistCandidate: () =>
          operations.replaceDataAndPersistDetailedInternal(mutation.data, true, true),
        candidateSyncFailed: () =>
          context.failedAlarmSyncSignatureRef.current === candidateAlarmSignature ||
          context.failedSleepReminderSyncSignatureRef.current === candidateSleepSignature,
        persistRollback: () =>
          operations.replaceDataAndPersistDetailedInternal(current, false, true),
      });
      if (persisted.status === 'success') {
        return { status: 'deleted', patternId } as const;
      }
      return {
        status: 'failure',
        reason: persisted.reason === 'save-failed' ? 'storage-failed' : persisted.reason,
        rolledBack: persisted.rolledBack,
      } as const;
    });
  };

  operations.previewPatternApplication = (input: PatternApplicationInput) => {
    if (!context.readyRef.current) {
      return { status: 'failure', reason: 'not-ready' } as const;
    }
    return previewPatternApplicationForData(context.dataRef.current, input);
  };

  operations.persistPatternTransaction = async (
    current: AppData,
    candidate: AppData,
  ): Promise<
    | {
        status: 'success';
      }
    | {
        status: 'failure';
        reason: 'backup-failed' | 'save-failed' | 'sync-failed' | 'rollback-failed';
        rolledBack: boolean;
      }
  > => {
    const candidateAlarmSignature = getAlarmScheduleSignature(candidate);
    const candidateSleepSignature = getSleepReminderScheduleSignature(candidate);
    return runPatternPersistenceTransaction({
      createSafetyBackup: async () => {
        await operations.createBackupInternal();
      },
      persistCandidate: () =>
        operations.replaceDataAndPersistDetailedInternal(candidate, true, true),
      candidateSyncFailed: () =>
        context.failedAlarmSyncSignatureRef.current === candidateAlarmSignature ||
        context.failedSleepReminderSyncSignatureRef.current === candidateSleepSignature,
      persistRollback: () => operations.replaceDataAndPersistDetailedInternal(current, false, true),
    });
  };

  operations.applyPatternFromVault = async (
    input: PatternApplicationInput,
  ): Promise<PatternApplyResult> => {
    if (!context.readyRef.current) {
      return { status: 'failure', reason: 'not-ready', rolledBack: false };
    }
    return context.mutationCoordinator.run(async () => {
      const current = context.dataRef.current;
      const now = context.runtime.now();
      const historyId = `apply-${now.getTime().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      const mutation = buildPatternApplicationMutation(current, input, now, historyId);
      if (mutation.status === 'failure') {
        return {
          status: 'failure',
          reason: mutation.reason,
          rolledBack: false,
        };
      }
      const scheduleEnforcement = enforceAppDataScheduleSafety(mutation.data);
      if (scheduleEnforcement.data === null || scheduleEnforcement.alarmsDisabled) {
        operations.reportInvalidWorkSchedule();
        return {
          status: 'failure',
          reason: 'invalid-schedule',
          rolledBack: false,
        };
      }
      const persisted = await operations.persistPatternTransaction(
        current,
        scheduleEnforcement.data,
      );
      if (persisted.status === 'failure') return persisted;
      return {
        status: 'success',
        patternId: input.patternId,
        historyId,
        clearedOverrideDateKeys: mutation.preview.clearedOverrideDateKeys,
      };
    });
  };

  operations.rollbackLastPatternApplication = async (): Promise<PatternRollbackResult> => {
    if (!context.readyRef.current) {
      return { status: 'failure', reason: 'not-ready', rolledBack: false };
    }
    return context.mutationCoordinator.run(async () => {
      const current = context.dataRef.current;
      const mutation = buildPatternRollbackMutation(current);
      if (mutation.status === 'nothing-to-rollback') return mutation;
      if (mutation.status === 'failure') {
        return {
          status: 'failure',
          reason: mutation.reason,
          rolledBack: false,
        };
      }
      const scheduleEnforcement = enforceAppDataScheduleSafety(mutation.data);
      if (scheduleEnforcement.data === null || scheduleEnforcement.alarmsDisabled) {
        operations.reportInvalidWorkSchedule();
        return {
          status: 'failure',
          reason: 'invalid-schedule',
          rolledBack: false,
        };
      }
      const persisted = await operations.persistPatternTransaction(
        current,
        scheduleEnforcement.data,
      );
      if (persisted.status === 'failure') return persisted;
      return { status: 'success', historyId: mutation.history.id };
    });
  };
}
