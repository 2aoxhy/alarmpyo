import type { AppDataRepository } from '../../application/runtime/app-runtime-ports';
import type { AppStoreStoragePort } from '../../application/runtime/store/storage-port';
import { APP_DATA_STORAGE_KEY } from '../storage/app-data-storage-keys';
import {
  createLatestStorageValueCoordinator,
  createSerializedStorageWriter,
} from '../storage/serialized-storage';
import {
  clearExplicitResetMarker,
  hasExplicitResetMarker,
  loadAppDataFromStorage,
  writeExplicitResetMarker,
  type CorruptDataQuarantine,
} from '../storage/cold-load-recovery';
import {
  findMatchingLastKnownGoodSnapshot,
  persistSnapshotWithLastKnownGood,
  readAutomaticBackup,
  readRecoveryBackup,
  writeAutomaticBackup,
  writeLastKnownGoodBackup,
} from '../storage/snapshot-backup';
import {
  protectPendingRestoreBackupBeforeDataChange,
  readPendingRestoreBackup,
  reconcilePendingRestoreBackup,
  repairCorruptPendingRestoreBackup,
  restoreWithAutomaticBackupCommit,
  retryPendingRestoreBackupCommit,
} from '../storage/restore-transaction';

/** One repository, one writer and one latest-value journal for the lifetime of an engine. */
export function createAppStoreStoragePort(
  repository: AppDataRepository,
  quarantine: CorruptDataQuarantine,
): AppStoreStoragePort {
  const writer = createSerializedStorageWriter(repository);
  const latest = createLatestStorageValueCoordinator(writer, APP_DATA_STORAGE_KEY);
  return {
    load: (defaultData, now, options) =>
      loadAppDataFromStorage(repository, defaultData, now, quarantine, options),
    getPersistedValue: latest.getPersistedValue,
    setPersistedValue: latest.setPersistedValue,
    writePrimary: (snapshot) => writer.write(APP_DATA_STORAGE_KEY, snapshot),
    persistSnapshot: (snapshot, lastKnownGoodSnapshot, options) =>
      persistSnapshotWithLastKnownGood(latest, writer, snapshot, lastKnownGoodSnapshot, options),
    writeLastKnownGood: (snapshot) => writeLastKnownGoodBackup(writer, snapshot),
    findMatchingLastKnownGood: (snapshot) =>
      findMatchingLastKnownGoodSnapshot(repository, snapshot),
    writeAutomaticBackup: (data) => writeAutomaticBackup(writer, data),
    readAutomaticBackup: () => readAutomaticBackup(repository),
    readRecoveryBackup: () => readRecoveryBackup(repository),
    hasExplicitResetMarker: () => hasExplicitResetMarker(repository),
    writeExplicitResetMarker: () => writeExplicitResetMarker(writer),
    clearExplicitResetMarker: () => clearExplicitResetMarker(writer),
    reconcilePendingRestore: (data) => reconcilePendingRestoreBackup(repository, writer, data),
    repairPendingRestore: () => repairCorruptPendingRestoreBackup(repository, writer),
    readPendingRestore: (data) => readPendingRestoreBackup(repository, data),
    protectPendingRestore: (current, next) =>
      protectPendingRestoreBackupBeforeDataChange(repository, writer, current, next),
    retryPendingRestore: (data, options) =>
      retryPendingRestoreBackupCommit(repository, writer, data, options),
    restoreWithBackup: (current, next, restore) =>
      restoreWithAutomaticBackupCommit(writer, current, next, restore),
  };
}
