import Constants from 'expo-constants';
import {
  Directory,
  DownloadTask,
  File,
  Paths,
  type DownloadPauseState,
} from 'expo-file-system';
import { Platform } from 'react-native';

import { getAlarmPyoNativeModule } from '../infrastructure/alarmpyo-native-module';
import { stripOptionalUtf8Bom } from '../utils/json';

import {
  APK_SHA256_PATTERN,
  collectHttpsUrlCandidates,
  EXPECTED_APK_PACKAGE_NAME,
  getApkDownloadUrls,
  isRecord,
  parseApkReleaseManifest,
  type ApkReleaseManifest,
} from './apk-update-manifest';
import {
  canResumeApkDownload,
  createApkDownloadResumeState,
  parseApkDownloadResumeState,
} from './apk-download-resume-policy';
import {
  getApkUpdateCacheFileNames,
  isApkManifestCacheFresh,
  shouldDeleteApkCacheFile,
} from './apk-update-cache-policy';

export {
  formatApkSize,
  parseApkReleaseManifest,
  type ApkReleaseManifest,
} from './apk-update-manifest';

const MANIFEST_TIMEOUT_MS = 15_000;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MANIFEST_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const UPDATE_DIRECTORY_NAME = 'alarmpyo-updates';
const MANIFEST_CACHE_FILE_NAME = 'latest-manifest-cache.json';

export type InstalledAppInfo = {
  supported: boolean;
  packageName: string;
  versionCode: number;
  versionName: string;
  installPermissionAllowed: boolean;
};

export type ApkUpdateCheck = {
  supported: boolean;
  installed: InstalledAppInfo | null;
  release: ApkReleaseManifest | null;
  available: boolean;
  manifestFromCache: boolean;
};

export type ApkInstallResult = {
  opened: boolean;
  permissionRequired: boolean;
  versionCode: number;
  sha256: string;
};

function normalizeApkVerification(value: unknown): void {
  if (
    !isRecord(value) ||
    value.valid !== true ||
    !Number.isInteger(value.versionCode) ||
    typeof value.sha256 !== 'string' ||
    !APK_SHA256_PATTERN.test(value.sha256)
  ) {
    throw new Error('앱 설치 파일을 안전하게 검증하지 못했습니다.');
  }
}

const nativeModule =
  Platform.OS === 'android'
    ? getAlarmPyoNativeModule()
    : null;

function normalizeInstalledAppInfo(value: unknown): InstalledAppInfo {
  if (
    !isRecord(value) ||
    value.supported !== true ||
    value.packageName !== EXPECTED_APK_PACKAGE_NAME ||
    typeof value.versionName !== 'string' ||
    !Number.isInteger(value.versionCode) ||
    (value.versionCode as number) <= 0 ||
    typeof value.installPermissionAllowed !== 'boolean'
  ) {
    throw new Error('설치된 앱 정보를 확인하지 못했습니다.');
  }
  return {
    supported: true,
    packageName: EXPECTED_APK_PACKAGE_NAME,
    versionName: value.versionName,
    versionCode: value.versionCode as number,
    installPermissionAllowed: value.installPermissionAllowed,
  };
}

function normalizeInstallResult(value: unknown): ApkInstallResult {
  if (
    !isRecord(value) ||
    typeof value.opened !== 'boolean' ||
    typeof value.permissionRequired !== 'boolean' ||
    !Number.isInteger(value.versionCode) ||
    typeof value.sha256 !== 'string' ||
    !APK_SHA256_PATTERN.test(value.sha256)
  ) {
    throw new Error('앱 설치 화면을 열지 못했습니다.');
  }
  return {
    opened: value.opened,
    permissionRequired: value.permissionRequired,
    versionCode: value.versionCode as number,
    sha256: value.sha256.toLowerCase(),
  };
}

function manifestUrls(): string[] {
  const extra = Constants.expoConfig?.extra;
  return collectHttpsUrlCandidates(
    extra?.apkUpdateManifestUrls,
    extra?.apkUpdateManifestUrl,
  );
}

function updateDirectory(): Directory {
  return new Directory(Paths.cache, UPDATE_DIRECTORY_NAME);
}

function readCachedManifest(): ApkReleaseManifest | null {
  const file = new File(updateDirectory(), MANIFEST_CACHE_FILE_NAME);
  if (!file.exists) return null;
  try {
    const value = JSON.parse(file.textSync());
    if (
      !isRecord(value) ||
      typeof value.cachedAt !== 'string' ||
      !isApkManifestCacheFresh(
        value.cachedAt,
        Date.now(),
        MANIFEST_CACHE_MAX_AGE_MS,
      )
    ) {
      return null;
    }
    return parseApkReleaseManifest(value.manifest);
  } catch {
    return null;
  }
}

function writeCachedManifest(manifest: ApkReleaseManifest): void {
  try {
    const directory = updateDirectory();
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, MANIFEST_CACHE_FILE_NAME);
    file.write(JSON.stringify({ cachedAt: new Date().toISOString(), manifest }));
  } catch {
    // 캐시는 보조 수단이므로 저장 실패가 업데이트 확인을 막지 않게 해요.
  }
}

async function fetchManifestFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<ApkReleaseManifest> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), MANIFEST_TIMEOUT_MS);
  const abort = () => timeoutController.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${separator}t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: timeoutController.signal,
    });
    if (!response.ok) throw new Error('최신 앱 정보를 불러오지 못했습니다.');
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_MANIFEST_BYTES) {
      throw new Error('앱 업데이트 정보가 너무 큽니다.');
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_MANIFEST_BYTES) {
      throw new Error('앱 업데이트 정보가 너무 큽니다.');
    }
    return parseApkReleaseManifest(JSON.parse(stripOptionalUtf8Bom(text)));
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

async function fetchManifest(
  signal?: AbortSignal,
): Promise<{ manifest: ApkReleaseManifest; fromCache: boolean }> {
  let lastError: unknown = null;
  for (const url of manifestUrls()) {
    if (signal?.aborted) throw new Error('앱 업데이트 확인을 취소했습니다.');
    try {
      const manifest = await fetchManifestFromUrl(url, signal);
      writeCachedManifest(manifest);
      return { manifest, fromCache: false };
    } catch (error) {
      lastError = error;
    }
  }
  const cached = readCachedManifest();
  if (cached) return { manifest: cached, fromCache: true };
  if (lastError instanceof Error) throw lastError;
  throw new Error('최신 앱 정보를 불러오지 못했습니다.');
}

export async function checkForApkUpdate(
  signal?: AbortSignal,
): Promise<ApkUpdateCheck> {
  const installed = await getInstalledAppInfo();
  if (!installed) {
    return {
      supported: false,
      installed: null,
      release: null,
      available: false,
      manifestFromCache: false,
    };
  }
  const { manifest: release, fromCache } = await fetchManifest(signal);
  cleanupApkUpdateCache(installed.versionCode, release.versionCode);
  return {
    supported: true,
    installed,
    release,
    available: release.versionCode > installed.versionCode,
    manifestFromCache: fromCache,
  };
}

function cleanupApkUpdateCache(
  installedVersionCode: number,
  releaseVersionCode: number,
): void {
  const directory = updateDirectory();
  if (!directory.exists) return;

  try {
    for (const entry of directory.list()) {
      if (
        entry instanceof File &&
        shouldDeleteApkCacheFile(
          entry.name,
          installedVersionCode,
          releaseVersionCode,
        )
      ) {
        entry.delete();
      }
    }
  } catch {
    // 캐시 정리는 부가 작업이므로 실패해도 업데이트 확인과 설치를 계속해요.
  }
}

export async function getInstalledAppInfo(): Promise<InstalledAppInfo | null> {
  if (!nativeModule?.getAppInstallInfoAsync) return null;
  return normalizeInstalledAppInfo(await nativeModule.getAppInstallInfoAsync());
}

function removeFileIfPresent(file: File): void {
  if (file.exists) file.delete();
}

function tryRemoveFileIfPresent(file: File): void {
  try {
    removeFileIfPresent(file);
  } catch {
    // 캐시 정리 실패가 APK 검증과 다운로드 흐름을 막지 않게 해요.
  }
}

function readDownloadResumeState(file: File): ReturnType<typeof parseApkDownloadResumeState> {
  if (!file.exists) return null;
  try {
    return parseApkDownloadResumeState(JSON.parse(file.textSync()));
  } catch {
    return null;
  }
}

function writeDownloadResumeState(
  file: File,
  release: ApkReleaseManifest,
  url: string,
  partial: File,
  resumeData: string,
): void {
  if (!partial.exists || partial.size <= 0 || partial.size >= release.sizeBytes) {
    tryRemoveFileIfPresent(file);
    return;
  }
  file.write(
    JSON.stringify(
      createApkDownloadResumeState({
        versionCode: release.versionCode,
        url,
        fileUri: partial.uri,
        sizeBytes: release.sizeBytes,
        resumeData,
      }),
    ),
  );
}

type ApkUpdateCacheFiles = {
  completed: File;
  partial: File;
  resume: File;
};

function getApkUpdateCacheFiles(
  directory: Directory,
  versionCode: number,
): ApkUpdateCacheFiles {
  const names = getApkUpdateCacheFileNames(versionCode);
  return {
    completed: new File(directory, names.completed),
    partial: new File(directory, names.partial),
    resume: new File(directory, names.resume),
  };
}

function cleanupApkCacheAfterSuccess(
  directory: Directory,
  versionCode: number,
  completedUri: string,
): void {
  // File.move()는 원본 File 객체의 URI를 바꾸므로 새 객체로 원래 캐시 경로를 정리해요.
  const cache = getApkUpdateCacheFiles(directory, versionCode);
  const files = [
    ...(cache.completed.uri === completedUri ? [] : [cache.completed]),
    cache.partial,
    cache.resume,
  ];
  for (const file of files) {
    tryRemoveFileIfPresent(file);
  }
}

export async function downloadApkUpdate(
  release: ApkReleaseManifest,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (
    !nativeModule?.verifyAndOpenApkInstallerAsync ||
    !nativeModule.verifyApkUpdateAsync
  ) {
    throw new Error('이 설치본에서는 앱 업데이트를 사용할 수 없습니다.');
  }
  const directory = updateDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const currentCache = getApkUpdateCacheFiles(
    directory,
    release.versionCode,
  );
  for (const cache of [currentCache]) {
    if (!cache.completed.exists) continue;
    if (cache.completed.size !== release.sizeBytes) {
      tryRemoveFileIfPresent(cache.completed);
      continue;
    }
    try {
      normalizeApkVerification(
        await nativeModule.verifyApkUpdateAsync(
          cache.completed.uri,
          release.sha256,
          release.versionCode,
        ),
      );
      const verifiedFile = cache.completed;
      cleanupApkCacheAfterSuccess(
        directory,
        release.versionCode,
        verifiedFile.uri,
      );
      onProgress?.(1);
      return verifiedFile.uri;
    } catch {
      tryRemoveFileIfPresent(cache.completed);
    }
  }
  const completed = currentCache.completed;
  const downloadUrls = getApkDownloadUrls(release);
  for (const cache of [currentCache]) {
    if (!cache.partial.exists || cache.partial.size < release.sizeBytes) continue;
    if (cache.partial.size === release.sizeBytes) {
      let movedToCompleted = false;
      try {
        await cache.partial.move(completed, { overwrite: true });
        movedToCompleted = true;
        normalizeApkVerification(
          await nativeModule.verifyApkUpdateAsync(
            completed.uri,
            release.sha256,
            release.versionCode,
          ),
        );
        cleanupApkCacheAfterSuccess(
          directory,
          release.versionCode,
          completed.uri,
        );
        onProgress?.(1);
        return completed.uri;
      } catch (error) {
        const sourceCache = getApkUpdateCacheFiles(
          directory,
          release.versionCode,
        );
        if (!movedToCompleted && sourceCache.partial.exists) {
          throw new Error(
            '받아 둔 앱 설치 파일을 준비하지 못했습니다. 다시 시도해야 합니다.',
            { cause: error },
          );
        }
        tryRemoveFileIfPresent(completed);
      }
    }
    const freshCache = getApkUpdateCacheFiles(
      directory,
      release.versionCode,
    );
    tryRemoveFileIfPresent(freshCache.partial);
    tryRemoveFileIfPresent(freshCache.resume);
  }

  let partial = getApkUpdateCacheFiles(directory, release.versionCode).partial;
  let resumeFile = getApkUpdateCacheFiles(directory, release.versionCode).resume;
  let selectedResumeState: ReturnType<typeof parseApkDownloadResumeState> = null;
  for (const cache of [getApkUpdateCacheFiles(directory, release.versionCode)]) {
    if (!cache.partial.exists) {
      tryRemoveFileIfPresent(cache.resume);
      continue;
    }
    const state = readDownloadResumeState(cache.resume);
    const partialSize = cache.partial.size;
    const valid =
      partialSize > 0 &&
      partialSize < release.sizeBytes &&
      state !== null &&
      downloadUrls.includes(state.url) &&
      canResumeApkDownload(state, {
        versionCode: release.versionCode,
        url: state.url,
        fileUri: cache.partial.uri,
        sizeBytes: release.sizeBytes,
        partialSize,
      });
    if (valid && selectedResumeState === null) {
      partial = cache.partial;
      resumeFile = cache.resume;
      selectedResumeState = state;
      continue;
    }
    tryRemoveFileIfPresent(cache.partial);
    tryRemoveFileIfPresent(cache.resume);
  }
  const orderedDownloadUrls = selectedResumeState
    ? [
        selectedResumeState.url,
        ...downloadUrls.filter((url) => url !== selectedResumeState?.url),
      ]
    : downloadUrls;
  let terminalIssue: 'oversize' | null = null;
  for (const url of orderedDownloadUrls) {
    if (signal?.aborted) throw new Error('앱 설치 파일 다운로드를 취소했습니다.');
    let exceededSizeLimit = false;
    const freshCurrentCache = getApkUpdateCacheFiles(
      directory,
      release.versionCode,
    );
    if (!partial.exists && partial.uri !== freshCurrentCache.partial.uri) {
      partial = freshCurrentCache.partial;
      resumeFile = freshCurrentCache.resume;
    }
    const savedState = readDownloadResumeState(resumeFile);
    let partialSize = partial.exists ? partial.size : 0;
    let resumableState = canResumeApkDownload(savedState, {
      versionCode: release.versionCode,
      url,
      fileUri: partial.uri,
      sizeBytes: release.sizeBytes,
      partialSize,
    })
      ? savedState
      : null;
    if (partialSize > 0 && !resumableState) {
      tryRemoveFileIfPresent(partial);
      tryRemoveFileIfPresent(resumeFile);
      if (partial.uri !== freshCurrentCache.partial.uri) {
        partial = freshCurrentCache.partial;
        resumeFile = freshCurrentCache.resume;
      }
      partialSize = 0;
      resumableState = null;
    }
    let task: DownloadTask;
    const taskOptions = {
      sessionType: 'background' as const,
      onProgress: ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => {
        if (bytesWritten > release.sizeBytes) {
          exceededSizeLimit = true;
          task.cancel();
          return;
        }
        const total = totalBytes > 0 ? totalBytes : release.sizeBytes;
        onProgress?.(Math.max(0, Math.min(1, bytesWritten / total)));
      },
    };
    task = resumableState
      ? DownloadTask.fromSavable(
          {
            url,
            fileUri: partial.uri,
            isDirectory: false,
            resumeData: resumableState.resumeData,
          } satisfies DownloadPauseState,
          taskOptions,
        )
      : new DownloadTask(url, partial, taskOptions);
    if (partialSize > 0) onProgress?.(Math.min(1, partialSize / release.sizeBytes));
    const abortDownload = () => {
      if (task.state === 'active') task.pause();
    };
    signal?.addEventListener('abort', abortDownload, { once: true });
    try {
      const downloaded = resumableState
        ? await task.resumeAsync()
        : await task.downloadAsync();
      if (!downloaded) {
        const pauseState = task.savable();
        writeDownloadResumeState(
          resumeFile,
          release,
          url,
          partial,
          pauseState.resumeData ?? String(partial.size),
        );
        throw new Error('앱 설치 파일 다운로드를 멈췄습니다. 다음에 중단된 지점부터 이어받습니다.');
      }
      if (downloaded.size !== release.sizeBytes) {
        throw new Error('앱 설치 파일 크기가 배포 정보와 일치하지 않습니다.');
      }
      await downloaded.move(completed, { overwrite: true });
      normalizeApkVerification(
        await nativeModule.verifyApkUpdateAsync(
          completed.uri,
          release.sha256,
          release.versionCode,
        ),
      );
      cleanupApkCacheAfterSuccess(
        directory,
        release.versionCode,
        completed.uri,
      );
      onProgress?.(1);
      return completed.uri;
    } catch {
      tryRemoveFileIfPresent(completed);
      if (exceededSizeLimit) {
        tryRemoveFileIfPresent(partial);
        tryRemoveFileIfPresent(resumeFile);
      } else if (partial.exists && partial.size > 0 && partial.size < release.sizeBytes) {
        writeDownloadResumeState(
          resumeFile,
          release,
          url,
          partial,
          String(partial.size),
        );
      }
      if (signal?.aborted) {
        throw new Error('앱 설치 파일 다운로드를 멈췄습니다. 다음에 중단된 지점부터 이어받습니다.');
      }
      terminalIssue = exceededSizeLimit ? 'oversize' : null;
    } finally {
      signal?.removeEventListener('abort', abortDownload);
      task.release();
    }
  }
  if (terminalIssue === 'oversize' && downloadUrls.length === 1) {
    throw new Error('앱 설치 파일 크기가 배포 정보보다 큽니다.');
  }
  throw new Error(
    '앱 설치 파일을 모두 받지 못했습니다. 연결을 확인하고 다시 누르면 중단된 지점부터 이어받습니다.',
  );
}

export async function findCachedApkUpdate(
  release: ApkReleaseManifest,
): Promise<string | null> {
  if (!nativeModule?.verifyApkUpdateAsync) return null;
  const directory = updateDirectory();
  const currentCache = getApkUpdateCacheFiles(
    directory,
    release.versionCode,
  );
  for (const cache of [currentCache]) {
    if (!cache.completed.exists) continue;
    if (cache.completed.size !== release.sizeBytes) {
      tryRemoveFileIfPresent(cache.completed);
      continue;
    }
    try {
      normalizeApkVerification(
        await nativeModule.verifyApkUpdateAsync(
          cache.completed.uri,
          release.sha256,
          release.versionCode,
        ),
      );
      cleanupApkCacheAfterSuccess(
        directory,
        release.versionCode,
        cache.completed.uri,
      );
      return cache.completed.uri;
    } catch {
      tryRemoveFileIfPresent(cache.completed);
    }
  }
  return null;
}

export async function verifyAndOpenApkInstaller(
  fileUri: string,
  release: ApkReleaseManifest,
): Promise<ApkInstallResult> {
  if (!nativeModule?.verifyAndOpenApkInstallerAsync) {
    throw new Error('이 설치본에서는 앱 업데이트를 사용할 수 없습니다.');
  }
  return normalizeInstallResult(
    await nativeModule.verifyAndOpenApkInstallerAsync(
      fileUri,
      release.sha256,
      release.versionCode,
    ),
  );
}

export async function openApkInstallPermissionSettings(): Promise<void> {
  if (!nativeModule?.openApkInstallPermissionSettingsAsync) {
    throw new Error('앱 설치 권한 설정을 열 수 없습니다.');
  }
  await nativeModule.openApkInstallPermissionSettingsAsync();
}
