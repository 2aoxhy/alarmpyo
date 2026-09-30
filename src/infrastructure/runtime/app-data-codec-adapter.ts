import type { AppDataCodecPort } from '../../application/app-data-codec-port';
import {
  appDataFromImportPreview,
  canonicalizeAppData,
  exportAppDataToJson,
  previewAppDataImport,
  serializeAppData,
  tryParseAppDataJson,
} from '../../services/app-data-service';

/** The existing migration/validation/serialization algorithms remain the wire authority. */
export const appDataCodec: AppDataCodecPort = {
  canonicalize: canonicalizeAppData,
  tryParse: tryParseAppDataJson,
  serialize: serializeAppData,
  export: exportAppDataToJson,
  previewImport: previewAppDataImport,
  fromImportPreview: appDataFromImportPreview,
};
