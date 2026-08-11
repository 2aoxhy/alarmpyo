import { isRecord } from './apk-update-manifest';

export const APK_DOWNLOAD_RESUME_SCHEMA_VERSION = 1;

export type ApkDownloadResumeState = {
  schemaVersion: typeof APK_DOWNLOAD_RESUME_SCHEMA_VERSION;
  versionCode: number;
  url: string;
  fileUri: string;
  sizeBytes: number;
  resumeData: string;
  updatedAt: string;
};

export function createApkDownloadResumeState(input: {
  versionCode: number;
  url: string;
  fileUri: string;
  sizeBytes: number;
  resumeData: string;
  now?: Date;
}): ApkDownloadResumeState {
  return {
    schemaVersion: APK_DOWNLOAD_RESUME_SCHEMA_VERSION,
    versionCode: input.versionCode,
    url: input.url,
    fileUri: input.fileUri,
    sizeBytes: input.sizeBytes,
    resumeData: input.resumeData,
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
}

export function parseApkDownloadResumeState(
  value: unknown,
): ApkDownloadResumeState | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== APK_DOWNLOAD_RESUME_SCHEMA_VERSION ||
    !Number.isInteger(value.versionCode) ||
    (value.versionCode as number) <= 0 ||
    typeof value.url !== 'string' ||
    typeof value.fileUri !== 'string' ||
    !Number.isInteger(value.sizeBytes) ||
    (value.sizeBytes as number) <= 0 ||
    typeof value.resumeData !== 'string' ||
    !/^\d+$/.test(value.resumeData) ||
    Number(value.resumeData) <= 0 ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    return null;
  }

  try {
    if (new URL(value.url).protocol !== 'https:') return null;
    if (!value.fileUri.startsWith('file:')) return null;
  } catch {
    return null;
  }

  return value as ApkDownloadResumeState;
}

export function canResumeApkDownload(
  state: ApkDownloadResumeState | null,
  expected: {
    versionCode: number;
    url: string;
    fileUri: string;
    sizeBytes: number;
    partialSize: number;
  },
): state is ApkDownloadResumeState {
  if (!state) return false;
  const resumeOffset = Number(state.resumeData);
  return (
    state.versionCode === expected.versionCode &&
    state.url === expected.url &&
    state.fileUri === expected.fileUri &&
    state.sizeBytes === expected.sizeBytes &&
    resumeOffset === expected.partialSize &&
    resumeOffset > 0 &&
    resumeOffset < expected.sizeBytes
  );
}
