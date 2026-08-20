import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  exportBackupFile,
  pickBackupFile,
} from '../../services/backup-file-service';
import {
  decryptBackupContents,
  encryptBackupContents,
  isEncryptedBackupContents,
} from '../../services/encrypted-backup-service';
import {
  pickWorkSettingsFile,
  shareWorkSettingsFile,
} from '../../services/work-settings-share-file-service';
import { doesWorkSettingsPreviewApplyEvening } from '../../services/work-settings-share-service';
import { createDataSettingsController } from './data-settings-controller';

/** Platform composition seam for the data-settings feature. */
export const dataSettingsController = createDataSettingsController({
  storage: AsyncStorage,
  clock: { now: () => new Date() },
  files: {
    exportBackupFile,
    pickBackupFile,
    encryptBackupContents,
    decryptBackupContents,
    isEncryptedBackupContents,
    pickWorkSettingsFile,
    shareWorkSettingsFile,
    doesWorkSettingsPreviewApplyEvening,
  },
});
