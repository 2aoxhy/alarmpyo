export const APP_DATA_STORAGE_KEY = 'alarmpyo:app-data:v1';
export const APP_DATA_AUTOMATIC_BACKUP_KEY =
  'alarmpyo:backup:before-reset';
export const APP_DATA_LAST_KNOWN_GOOD_KEY =
  'alarmpyo:backup:last-known-good';
export const APP_DATA_PENDING_RESTORE_BACKUP_KEY =
  'alarmpyo:backup:pending-before-restore:v1';
export const APP_DATA_EXPLICIT_RESET_MARKER_KEY =
  'alarmpyo:reset:explicit:v1';
export const APP_DATA_CORRUPT_BACKUP_KEY = 'alarmpyo:corrupt:last';
/** 손상된 복원 저널은 일반 AppData 손상 원본과 분리해 마지막 값만 보관합니다. */
export const APP_DATA_CORRUPT_PENDING_RESTORE_BACKUP_KEY =
  'alarmpyo:corrupt:pending-before-restore:v1';

export const CLEARED_PENDING_RESTORE_BACKUP = '';
