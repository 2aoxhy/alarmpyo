import type { AppData } from '../models/app-data';
import { APP_DATA_BACKUP_FORMAT, APP_DATA_BACKUP_FORMAT_VERSION } from '../infrastructure/app-data/import-envelope';
import { createAppDataJsonCodec, type AppDataJsonExportOptions, type AppDataJsonImportPreview, type AppDataJsonParseResult } from '../infrastructure/app-data/json-codec';
import { AppDataValidationError } from '../models/app-data-validation-error';
import type { PreviousAppDataVersion } from '../infrastructure/app-data/migrations';
import { APP_DATA_SCHEMA_PARSERS } from '../infrastructure/app-data/schema-parsers';
import { createAppDataSchemaValidator, type AppDataValidationOptions, type ParsedAppData } from '../infrastructure/app-data/schema-validator';
import { getCheckedAppDataContentsByteSize, getCheckedBackupContentsByteSize } from './backup-file-policy';

// Compatibility facade. Pure consumers import application policies directly.
export * from '../application/app-data-policy';
export { APP_DATA_BACKUP_FORMAT, APP_DATA_BACKUP_FORMAT_VERSION };
export { DEFAULT_PAYROLL_SETTINGS } from './payroll-policy';
export type { ParsedAppData };
export type AppDataParseResult = AppDataJsonParseResult<PreviousAppDataVersion>;
export type AppDataImportPreview = AppDataJsonImportPreview<PreviousAppDataVersion>;

const validateAppDataSchema = createAppDataSchemaValidator(
  APP_DATA_SCHEMA_PARSERS,
);

export function validateAndMigrateAppData(
  value: unknown,
  options: AppDataValidationOptions = {},
): ParsedAppData {
  return validateAppDataSchema(value, options);
}

/** 저장·상태·알람 계획에서 함께 사용할 현재 버전의 정규화된 앱 데이터를 만들어요. */
export function canonicalizeAppData(data: AppData): AppData {
  return validateAndMigrateAppData(data).data;
}

function assertAppDataJsonByteSize(raw: string): void {
  try {
    getCheckedAppDataContentsByteSize(raw);
  } catch (error) {
    throw new AppDataValidationError(
      error instanceof Error ? error.message : '근무표 데이터가 너무 큽니다.',
    );
  }
}

function assertBackupJsonByteSize(raw: string): void {
  try {
    getCheckedBackupContentsByteSize(raw);
  } catch (error) {
    throw new AppDataValidationError(
      error instanceof Error ? error.message : '백업 파일이 너무 큽니다.',
    );
  }
}

const appDataJsonCodec = createAppDataJsonCodec<PreviousAppDataVersion>({
  assertAppDataJsonByteSize,
  assertBackupJsonByteSize,
  canonicalizeAppData,
  validateAndMigrateAppData,
});

export function parseAppDataJson(raw: string): ParsedAppData {
  return appDataJsonCodec.parseAppDataJson(raw);
}

export function tryParseAppDataJson(raw: string): AppDataParseResult {
  return appDataJsonCodec.tryParseAppDataJson(raw);
}

export function serializeAppData(data: AppData): string {
  return appDataJsonCodec.serializeAppData(data);
}

export type AppDataExportOptions = AppDataJsonExportOptions;

export function exportAppDataToJson(
  data: AppData,
  now: Date = new Date(),
  options: AppDataExportOptions = {},
): string {
  return appDataJsonCodec.exportAppDataToJson(data, now, options);
}

export function previewAppDataImport(raw: string): AppDataImportPreview {
  return appDataJsonCodec.previewAppDataImport(raw);
}

export function appDataFromImportPreview(preview: AppDataImportPreview): AppData {
  return appDataJsonCodec.appDataFromImportPreview(preview);
}
