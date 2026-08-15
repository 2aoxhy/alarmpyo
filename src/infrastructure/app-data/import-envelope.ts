import {
  AppDataValidationError,
  isRecord,
  nullableIsoDate,
} from './validation';

export const APP_DATA_BACKUP_FORMAT = 'alarmpyo-backup' as const;
export const LEGACY_APP_DATA_BACKUP_FORMAT = 'today-shift-backup' as const;
export const APP_DATA_BACKUP_FORMAT_VERSION = 1 as const;

export type AppDataImportEnvelope = {
  data: unknown;
  exportedAt: string | null;
  source: 'backup' | 'data';
};

export function parseAppDataImportEnvelope(value: unknown): AppDataImportEnvelope {
  if (!isRecord(value) || value.format === undefined) {
    return { data: value, exportedAt: null, source: 'data' };
  }
  if (
    value.format !== APP_DATA_BACKUP_FORMAT &&
    value.format !== LEGACY_APP_DATA_BACKUP_FORMAT
  ) {
    throw new AppDataValidationError('지원하지 않는 백업 파일 형식입니다.');
  }
  if (
    value.formatVersion !== APP_DATA_BACKUP_FORMAT_VERSION
  ) {
    throw new AppDataValidationError('지원하지 않는 백업 파일 형식입니다.');
  }
  return {
    data: value.data,
    exportedAt: nullableIsoDate(value.exportedAt, '백업 생성일'),
    source: 'backup',
  };
}
