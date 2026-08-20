import type { AppDataImportPreview } from '../../services/app-data-service';
import type {
  SharedShiftSettings,
  WorkSettingsSharePreview,
} from '../../services/work-settings-share-service';

const LAST_BACKUP_EXPORT_ATTEMPT_AT_KEY =
  'alarmpyo:last-external-backup-export-attempt:v1';

export type DataSettingsKeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type DataSettingsClock = {
  now(): Date;
};

export type DataSettingsControllerDependencies = {
  storage: DataSettingsKeyValueStore;
  clock: DataSettingsClock;
  files: {
    exportBackupFile: typeof import('../../services/backup-file-service').exportBackupFile;
    pickBackupFile: typeof import('../../services/backup-file-service').pickBackupFile;
    encryptBackupContents: typeof import('../../services/encrypted-backup-service').encryptBackupContents;
    decryptBackupContents: typeof import('../../services/encrypted-backup-service').decryptBackupContents;
    isEncryptedBackupContents: typeof import('../../services/encrypted-backup-service').isEncryptedBackupContents;
    pickWorkSettingsFile: typeof import('../../services/work-settings-share-file-service').pickWorkSettingsFile;
    shareWorkSettingsFile: typeof import('../../services/work-settings-share-file-service').shareWorkSettingsFile;
    doesWorkSettingsPreviewApplyEvening: typeof import('../../services/work-settings-share-service').doesWorkSettingsPreviewApplyEvening;
  };
};

/**
 * Owns data-settings infrastructure calls so the route remains presentation
 * only. The persisted key and all existing file/crypto wire formats are kept
 * unchanged.
 */
export function createDataSettingsController(
  dependencies: DataSettingsControllerDependencies,
) {
  return {
    async readLastBackupExportAttemptAt(): Promise<string | null> {
      try {
        const value = await dependencies.storage.getItem(
          LAST_BACKUP_EXPORT_ATTEMPT_AT_KEY,
        );
        return value && Number.isFinite(Date.parse(value)) ? value : null;
      } catch {
        return null;
      }
    },

    async recordBackupExportAttempt(): Promise<string> {
      const attemptedAt = dependencies.clock.now().toISOString();
      try {
        await dependencies.storage.setItem(
          LAST_BACKUP_EXPORT_ATTEMPT_AT_KEY,
          attemptedAt,
        );
      } catch {
        // The share sheet has already closed. Auxiliary timestamp persistence
        // must never turn a successful export into a user-visible failure.
      }
      return attemptedAt;
    },

    ...dependencies.files,
  };
}

export type {
  AppDataImportPreview,
  SharedShiftSettings,
  WorkSettingsSharePreview,
};
