import {
  createLatestStorageValueCoordinator,
  createSerializedMutationCoordinator,
  createSerializedStorageWriter,
  type LatestStorageValueCoordinator,
  type SerializedMutationCoordinator,
  type StorageAdapter,
  type StorageWriter,
} from '../infrastructure/storage/serialized-storage';
import {
  APP_DATA_AUTOMATIC_BACKUP_KEY,
  APP_DATA_CORRUPT_BACKUP_KEY,
  APP_DATA_EXPLICIT_RESET_MARKER_KEY,
  APP_DATA_LAST_KNOWN_GOOD_KEY,
  APP_DATA_PENDING_RESTORE_BACKUP_KEY,
  APP_DATA_STORAGE_KEY,
} from '../infrastructure/storage/app-data-storage-keys';

export {
  APP_DATA_AUTOMATIC_BACKUP_KEY,
  APP_DATA_CORRUPT_BACKUP_KEY,
  APP_DATA_EXPLICIT_RESET_MARKER_KEY,
  APP_DATA_LAST_KNOWN_GOOD_KEY,
  APP_DATA_PENDING_RESTORE_BACKUP_KEY,
  APP_DATA_STORAGE_KEY,
};

export {
  createLatestStorageValueCoordinator,
  createSerializedMutationCoordinator,
  createSerializedStorageWriter,
};
export type {
  LatestStorageValueCoordinator,
  SerializedMutationCoordinator,
  StorageAdapter,
  StorageWriter,
};

export * from '../infrastructure/storage/persistence-outcomes';
export * from '../infrastructure/storage/cold-load-recovery';

export * from '../infrastructure/storage/snapshot-backup';

export * from '../infrastructure/storage/restore-transaction';
