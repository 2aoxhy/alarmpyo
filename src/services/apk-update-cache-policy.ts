const APK_CACHE_FILE_PATTERN = /^AlarmPyo_(\d+)\.apk(?:\.(part|resume\.json))?$/;

export type ApkUpdateCacheFileNames = {
  completed: string;
  partial: string;
  resume: string;
};

export function getApkUpdateCacheFileNames(
  versionCode: number,
): ApkUpdateCacheFileNames {
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) {
    throw new RangeError('APK 캐시 버전 정보가 올바르지 않아요.');
  }
  return {
    completed: `AlarmPyo_${versionCode}.apk`,
    partial: `AlarmPyo_${versionCode}.apk.part`,
    resume: `AlarmPyo_${versionCode}.apk.resume.json`,
  };
}

export function isApkManifestCacheFresh(
  cachedAt: string,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  const cachedAtMs = Date.parse(cachedAt);
  if (!Number.isFinite(cachedAtMs) || !Number.isFinite(nowMs) || maxAgeMs < 0) {
    return false;
  }
  const ageMs = nowMs - cachedAtMs;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

/** 이전 버전 파일만 정리하고 현재 배포의 부분 다운로드는 이어받을 수 있게 유지해요. */
export function shouldDeleteApkCacheFile(
  fileName: string,
  installedVersionCode: number,
  releaseVersionCode: number,
): boolean {
  const match = APK_CACHE_FILE_PATTERN.exec(fileName);
  if (!match) return false;

  const cachedVersionCode = Number(match[1]);
  return (
    !Number.isSafeInteger(cachedVersionCode) ||
    cachedVersionCode <= installedVersionCode ||
    cachedVersionCode !== releaseVersionCode
  );
}
