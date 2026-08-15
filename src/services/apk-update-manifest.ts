export const EXPECTED_APK_PACKAGE_NAME = 'com.personal.alarmpyo';
export const APK_SHA256_PATTERN = /^[0-9a-f]{64}$/i;

const MIN_APK_BYTES = 1024 * 1024;
const MAX_APK_BYTES = 350 * 1024 * 1024;

export type ApkReleaseManifest = {
  schemaVersion: 1;
  packageName: typeof EXPECTED_APK_PACKAGE_NAME;
  versionCode: number;
  versionName: string;
  apkUrl: string;
  apkMirrors: string[];
  sha256: string;
  sizeBytes: number;
  publishedAt: string;
  artifactExpiresAt: string | null;
  notes: string[];
};

const MAX_APK_MIRRORS = 4;

function parseApkMirrors(value: unknown, primaryUrl: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_APK_MIRRORS) {
    throw new Error('앱 업데이트 정보가 올바르지 않습니다.');
  }
  const mirrors: string[] = [];
  for (const candidate of value) {
    if (
      typeof candidate !== 'string' ||
      candidate.length > 2_048 ||
      !isHttpsUrl(candidate)
    ) {
      throw new Error('앱 업데이트 정보가 올바르지 않습니다.');
    }
    if (candidate !== primaryUrl && !mirrors.includes(candidate)) {
      mirrors.push(candidate);
    }
  }
  return mirrors;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function collectHttpsUrlCandidates(
  configured: unknown,
  legacyConfigured: unknown,
  fallback?: string,
): string[] {
  const candidates = Array.isArray(configured) ? configured : [];
  const urls: string[] = [];
  for (const candidate of [...candidates, legacyConfigured, fallback]) {
    if (
      typeof candidate === 'string' &&
      candidate.length <= 2_048 &&
      isHttpsUrl(candidate) &&
      !urls.includes(candidate)
    ) {
      urls.push(candidate);
    }
  }
  return urls.slice(0, 5);
}

export function parseApkReleaseManifest(value: unknown): ApkReleaseManifest {
  if (!isRecord(value)) throw new Error('앱 업데이트 정보가 올바르지 않습니다.');
  const notes = Array.isArray(value.notes)
    ? value.notes.filter(
        (note): note is string =>
          typeof note === 'string' && note.trim().length > 0 && note.length <= 160,
      )
    : [];
  if (
    value.schemaVersion !== 1 ||
    value.packageName !== EXPECTED_APK_PACKAGE_NAME ||
    !Number.isInteger(value.versionCode) ||
    (value.versionCode as number) <= 0 ||
    (value.versionCode as number) > 1_000_000_000 ||
    typeof value.versionName !== 'string' ||
    value.versionName.trim().length === 0 ||
    value.versionName.length > 32 ||
    typeof value.apkUrl !== 'string' ||
    !isHttpsUrl(value.apkUrl) ||
    typeof value.sha256 !== 'string' ||
    !APK_SHA256_PATTERN.test(value.sha256) ||
    !Number.isInteger(value.sizeBytes) ||
    (value.sizeBytes as number) < MIN_APK_BYTES ||
    (value.sizeBytes as number) > MAX_APK_BYTES ||
    typeof value.publishedAt !== 'string' ||
    value.publishedAt.trim().length === 0 ||
    !Number.isFinite(Date.parse(value.publishedAt))
  ) {
    throw new Error('앱 업데이트 정보가 올바르지 않습니다.');
  }
  const apkUrl = value.apkUrl as string;
  const apkMirrors = parseApkMirrors(value.apkMirrors, apkUrl);
  const artifactExpiresAt = value.artifactExpiresAt;
  if (
    artifactExpiresAt !== undefined &&
    artifactExpiresAt !== null &&
    (typeof artifactExpiresAt !== 'string' ||
      !Number.isFinite(Date.parse(artifactExpiresAt)))
  ) {
    throw new Error('앱 업데이트 정보가 올바르지 않습니다.');
  }
  return {
    schemaVersion: 1,
    packageName: EXPECTED_APK_PACKAGE_NAME,
    versionCode: value.versionCode as number,
    versionName: value.versionName.trim(),
    apkUrl,
    apkMirrors,
    sha256: value.sha256.toLowerCase(),
    sizeBytes: value.sizeBytes as number,
    publishedAt: value.publishedAt,
    artifactExpiresAt:
      typeof artifactExpiresAt === 'string' ? artifactExpiresAt : null,
    notes,
  };
}

export function getApkDownloadUrls(
  release: ApkReleaseManifest,
  now = Date.now(),
): string[] {
  const primaryExpired =
    release.artifactExpiresAt !== null &&
    Date.parse(release.artifactExpiresAt) <= now;
  return primaryExpired && release.apkMirrors.length > 0
    ? [...release.apkMirrors]
    : [release.apkUrl, ...release.apkMirrors];
}

export function formatApkSize(sizeBytes: number): string {
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
}
