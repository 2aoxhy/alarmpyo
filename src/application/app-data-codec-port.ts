import type { AppData } from '../models/app-data';
import type { AppDataValidationError } from '../models/app-data-validation-error';

export type PreviousAppDataVersion =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;
export type ParsedAppData = {
  data: AppData;
  migratedFromVersion: PreviousAppDataVersion | null;
  requiresPersistence: boolean;
};
export type AppDataParseResult =
  | { ok: true; value: ParsedAppData }
  | { ok: false; error: AppDataValidationError };
export type AppDataImportPreview = {
  data: AppData;
  exportedAt: string | null;
  migratedFromVersion: PreviousAppDataVersion | null;
  source: 'backup' | 'data';
  summary: {
    patternName: string;
    anchorDate: string;
    scheduleStartDate: string;
    shiftTypeCount: number;
    changedDateCount: number;
    noteCount: number;
    notificationsEnabled: boolean;
  };
};

/** App commands require canonical data, never migration/schema implementation details. */
export interface AppDataCodecPort {
  canonicalize(data: AppData): AppData;
  tryParse(raw: string): AppDataParseResult;
  serialize(data: AppData): string;
  export(data: AppData, now?: Date, options?: { pretty?: boolean }): string;
  previewImport(raw: string): AppDataImportPreview;
  fromImportPreview(preview: AppDataImportPreview): AppData;
}
