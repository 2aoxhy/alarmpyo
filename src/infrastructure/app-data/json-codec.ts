import type { AppData } from '../../models/app-data';
import { stripOptionalUtf8Bom } from '../../utils/json';
import {
  APP_DATA_BACKUP_FORMAT,
  APP_DATA_BACKUP_FORMAT_VERSION,
  parseAppDataImportEnvelope,
} from './import-envelope';
import { AppDataValidationError } from './validation';

export type CodecParsedAppData<TVersion extends number> = {
  data: AppData;
  migratedFromVersion: TVersion | null;
  requiresPersistence: boolean;
};

export type AppDataJsonImportPreview<TVersion extends number> = {
  data: AppData;
  exportedAt: string | null;
  migratedFromVersion: TVersion | null;
  source: 'backup' | 'data';
  summary: {
    patternName: string;
    anchorDate: string;
    scheduleStartDate: string;
    shiftTypeCount: number;
    changedDateCount: number;
    noteCount: number;
  };
};

export type AppDataJsonParseResult<TVersion extends number> =
  | { ok: true; value: CodecParsedAppData<TVersion> }
  | { ok: false; error: AppDataValidationError };

export type AppDataJsonExportOptions = {
  pretty?: boolean;
};

type AppDataJsonCodecDependencies<TVersion extends number> = {
  assertAppDataJsonByteSize: (raw: string) => void;
  assertBackupJsonByteSize: (raw: string) => void;
  canonicalizeAppData: (data: AppData) => AppData;
  validateAndMigrateAppData: (
    value: unknown,
    options: { repairOversizedAlarmMinutes: true },
  ) => CodecParsedAppData<TVersion>;
};

/**
 * Pure JSON boundary for AppData. Storage, clocks and native runtime concerns
 * stay outside; validation and byte policies are injected by the facade.
 */
export function createAppDataJsonCodec<TVersion extends number>(
  dependencies: AppDataJsonCodecDependencies<TVersion>,
) {
  const parseAppDataJson = (
    raw: string,
  ): CodecParsedAppData<TVersion> => {
    dependencies.assertAppDataJsonByteSize(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripOptionalUtf8Bom(raw)) as unknown;
    } catch {
      throw new AppDataValidationError(
        '근무표 데이터의 JSON 형식이 올바르지 않습니다.',
      );
    }
    return dependencies.validateAndMigrateAppData(parsed, {
      repairOversizedAlarmMinutes: true,
    });
  };

  const tryParseAppDataJson = (
    raw: string,
  ): AppDataJsonParseResult<TVersion> => {
    try {
      return { ok: true, value: parseAppDataJson(raw) };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof AppDataValidationError
            ? error
            : new AppDataValidationError(
                '근무표 데이터를 확인하지 못했습니다.',
              ),
      };
    }
  };

  const serializeAppData = (data: AppData): string =>
    JSON.stringify(dependencies.canonicalizeAppData(data));

  const exportAppDataToJson = (
    data: AppData,
    now: Date = new Date(),
    options: AppDataJsonExportOptions = {},
  ): string => {
    const normalized = dependencies.canonicalizeAppData(data);
    return JSON.stringify(
      {
        format: APP_DATA_BACKUP_FORMAT,
        formatVersion: APP_DATA_BACKUP_FORMAT_VERSION,
        exportedAt: now.toISOString(),
        data: normalized,
      },
      null,
      options.pretty === false ? undefined : 2,
    );
  };

  const previewAppDataImport = (
    raw: string,
  ): AppDataJsonImportPreview<TVersion> => {
    dependencies.assertBackupJsonByteSize(raw);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(stripOptionalUtf8Bom(raw)) as unknown;
    } catch {
      throw new AppDataValidationError(
        '백업 파일의 JSON 형식이 올바르지 않습니다.',
      );
    }

    const envelope = parseAppDataImportEnvelope(parsedJson);
    const parsed = dependencies.validateAndMigrateAppData(envelope.data, {
      repairOversizedAlarmMinutes: true,
    });
    return {
      data: parsed.data,
      exportedAt: envelope.exportedAt,
      migratedFromVersion: parsed.migratedFromVersion,
      source: envelope.source,
      summary: {
        patternName: parsed.data.pattern.name,
        anchorDate: parsed.data.pattern.anchorDate,
        scheduleStartDate:
          parsed.data.pattern.scheduleStartDate ??
          parsed.data.pattern.anchorDate,
        shiftTypeCount: parsed.data.shiftTypes.length,
        changedDateCount: new Set([
          ...Object.keys(parsed.data.overrides),
          ...Object.keys(parsed.data.timeOverrides),
          ...Object.keys(parsed.data.dayExceptions),
          ...Object.keys(parsed.data.alarmOverrides),
        ]).size,
        noteCount: Object.keys(parsed.data.notes).length,
      },
    };
  };

  const appDataFromImportPreview = (
    preview: AppDataJsonImportPreview<TVersion>,
  ): AppData => dependencies.canonicalizeAppData(preview.data);

  return {
    appDataFromImportPreview,
    exportAppDataToJson,
    parseAppDataJson,
    previewAppDataImport,
    serializeAppData,
    tryParseAppDataJson,
  };
}
