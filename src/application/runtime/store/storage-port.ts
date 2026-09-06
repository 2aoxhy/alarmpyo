import type { AppData } from '../../../models/app-data';
import type { SnapshotPersistenceOutcome } from '../../persistence-outcomes';

export type AppDataLoadResult =
  | {
      ok: true;
      data: AppData;
      source: 'empty' | 'reset' | 'stored' | 'migrated';
      persistedSnapshot: string | null;
    }
  | {
      ok: false;
      reason: 'recovery-required';
      error: string;
      corruptBackupKey: null;
      recovery: {
        data: AppData;
        exportedAt: string | null;
        raw: string;
        source: 'device-safety' | 'last-known-good' | 'automatic';
      };
    }
  | { ok: false; reason: 'io' | 'corrupt'; error: string; corruptBackupKey: string | null };
export type AppDataLoadFailureReason = Extract<AppDataLoadResult, { ok: false }>['reason'];
export type PendingRestoreBackupRecoveryState =
  | 'committed'
  | 'target-matched'
  | 'source-matched'
  | 'diverged';
export type PendingRestoreBackupRetryResult =
  | { status: 'saved' }
  | { status: 'unavailable' }
  | { status: 'confirmation-required' }
  | { status: 'failed' };
export type StorePersistenceResult = SnapshotPersistenceOutcome & {
  primaryChanged: boolean;
  persistedSnapshot: string | null;
  lastKnownGoodSnapshot: string | null;
};
export type RestoreTransactionResult<T> = {
  restoreStarted: boolean;
  restoreResult: T | null;
  automaticBackupSaved: boolean;
  pendingBackupAvailable: boolean;
};

/**
 * The application owns operation semantics; storage keys, writer locks, JSON journals
 * and quarantine implementation stay in its injected repository adapter.
 * All mutating methods are called from the engine's one mutation queue.
 */
export interface AppStoreStoragePort {
  load(
    defaultData: AppData,
    now: Date,
    options?: {
      missingPrimaryRecoveryCandidates?: readonly { raw: string; source: 'device-safety' }[];
    },
  ): Promise<AppDataLoadResult>;
  getPersistedValue(): string | null;
  setPersistedValue(value: string | null): void;
  writePrimary(snapshot: string): Promise<void>;
  persistSnapshot(
    snapshot: string,
    lastKnownGoodSnapshot: string | null,
    options?: { force?: boolean },
  ): Promise<StorePersistenceResult>;
  writeLastKnownGood(snapshot: string): Promise<string>;
  findMatchingLastKnownGood(snapshot: string | null): Promise<string | null>;
  writeAutomaticBackup(data: AppData): Promise<string>;
  readAutomaticBackup(): Promise<string | null>;
  readRecoveryBackup(): Promise<string | null>;
  hasExplicitResetMarker(): Promise<boolean>;
  writeExplicitResetMarker(): Promise<void>;
  clearExplicitResetMarker(): Promise<void>;
  reconcilePendingRestore(currentData: AppData): Promise<boolean>;
  repairPendingRestore(): Promise<boolean>;
  readPendingRestore(
    currentData: AppData,
  ): Promise<{ backup: string; recoveryState: PendingRestoreBackupRecoveryState } | null>;
  protectPendingRestore(currentData: AppData, nextData: AppData): Promise<boolean>;
  retryPendingRestore(
    currentData: AppData,
    options?: { allowUnverified?: boolean },
  ): Promise<PendingRestoreBackupRetryResult>;
  restoreWithBackup<T extends { primarySaved: boolean }>(
    currentData: AppData,
    targetData: AppData,
    restore: () => Promise<T>,
  ): Promise<RestoreTransactionResult<T>>;
}

/** I/O failure is never evidence of corruption; preserve the primary in that case. */
export function canRecoverAppDataFromSafetyBackup(result: AppDataLoadResult): boolean {
  return !result.ok && result.reason === 'corrupt' && result.corruptBackupKey !== null;
}
