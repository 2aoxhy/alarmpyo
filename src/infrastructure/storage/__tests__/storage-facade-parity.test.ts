import { describe, expect, it } from 'vitest';

import * as storageFacade from '../../../services/app-storage-service';
import * as keys from '../app-data-storage-keys';
import * as coldLoad from '../cold-load-recovery';
import * as outcomes from '../persistence-outcomes';
import * as restore from '../restore-transaction';
import * as serialized from '../serialized-storage';
import * as snapshots from '../snapshot-backup';

describe('app-storage-service compatibility facade', () => {
  it('keeps every storage key byte-for-byte identical', () => {
    expect(storageFacade.APP_DATA_STORAGE_KEY).toBe(keys.APP_DATA_STORAGE_KEY);
    expect(storageFacade.APP_DATA_AUTOMATIC_BACKUP_KEY).toBe(
      keys.APP_DATA_AUTOMATIC_BACKUP_KEY,
    );
    expect(storageFacade.APP_DATA_LAST_KNOWN_GOOD_KEY).toBe(
      keys.APP_DATA_LAST_KNOWN_GOOD_KEY,
    );
    expect(storageFacade.APP_DATA_PENDING_RESTORE_BACKUP_KEY).toBe(
      keys.APP_DATA_PENDING_RESTORE_BACKUP_KEY,
    );
    expect(storageFacade.APP_DATA_EXPLICIT_RESET_MARKER_KEY).toBe(
      keys.APP_DATA_EXPLICIT_RESET_MARKER_KEY,
    );
    expect(storageFacade.APP_DATA_CORRUPT_BACKUP_KEY).toBe(
      keys.APP_DATA_CORRUPT_BACKUP_KEY,
    );
  });

  it('re-exports the extracted implementations without wrapper behavior', () => {
    expect(storageFacade.loadAppDataFromStorage).toBe(
      coldLoad.loadAppDataFromStorage,
    );
    expect(storageFacade.writeExplicitResetMarker).toBe(
      coldLoad.writeExplicitResetMarker,
    );
    expect(storageFacade.persistSnapshotWithLastKnownGood).toBe(
      snapshots.persistSnapshotWithLastKnownGood,
    );
    expect(storageFacade.readRecoveryBackup).toBe(
      snapshots.readRecoveryBackup,
    );
    expect(storageFacade.restoreWithAutomaticBackupCommit).toBe(
      restore.restoreWithAutomaticBackupCommit,
    );
    expect(storageFacade.reconcilePendingRestoreBackup).toBe(
      restore.reconcilePendingRestoreBackup,
    );
    expect(storageFacade.getSnapshotPersistenceOutcome).toBe(
      outcomes.getSnapshotPersistenceOutcome,
    );
    expect(storageFacade.createLatestStorageValueCoordinator).toBe(
      serialized.createLatestStorageValueCoordinator,
    );
  });
});
