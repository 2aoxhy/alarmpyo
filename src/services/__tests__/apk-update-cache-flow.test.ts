import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApkReleaseManifest } from '../apk-update-manifest';
import {
  downloadApkUpdate,
  findCachedApkUpdate,
} from '../apk-update-service';

const cacheHarness = vi.hoisted(() => ({
  files: new Map<string, { size: number; text: string; valid: boolean }>(),
  deleteFailures: new Set<string>(),
  moveFailures: new Set<string>(),
  failedDownloadUrls: new Set<string>(),
  downloadSize: 100,
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

vi.mock('../../infrastructure/alarmpyo-native-module', () => ({
  getAlarmPyoNativeModule: () => ({
    verifyAndOpenApkInstallerAsync: vi.fn(),
    verifyApkUpdateAsync: vi.fn(
      async (uri: string, sha256: string, versionCode: number) => {
        const file = cacheHarness.files.get(uri);
        if (!file?.valid) throw new Error('비정상 APK');
        return { valid: true, sha256, versionCode };
      },
    ),
  }),
}));

vi.mock('expo-file-system', () => {
  const join = (base: string, name?: string) =>
    name ? `${base.replace(/\/$/u, '')}/${name}` : base;

  class FakeDirectory {
    uri: string;

    constructor(base: string | FakeDirectory, name: string) {
      this.uri = join(typeof base === 'string' ? base : base.uri, name);
    }

    get exists() {
      return true;
    }

    create() {}

    list() {
      return [];
    }
  }

  class FakeFile {
    uri: string;

    constructor(base: string | FakeDirectory, name?: string) {
      this.uri = join(typeof base === 'string' ? base : base.uri, name);
    }

    get exists() {
      return cacheHarness.files.has(this.uri);
    }

    get size() {
      return cacheHarness.files.get(this.uri)?.size ?? 0;
    }

    get name() {
      return this.uri.split('/').at(-1) ?? '';
    }

    delete() {
      if (cacheHarness.deleteFailures.has(this.uri)) {
        throw new Error('삭제 실패');
      }
      cacheHarness.files.delete(this.uri);
    }

    textSync() {
      return cacheHarness.files.get(this.uri)?.text ?? '';
    }

    write(text: string) {
      cacheHarness.files.set(this.uri, {
        size: new TextEncoder().encode(text).length,
        text,
        valid: false,
      });
    }

    async move(destination: FakeFile) {
      if (cacheHarness.moveFailures.has(this.uri)) {
        throw new Error('이동 실패');
      }
      const value = cacheHarness.files.get(this.uri);
      if (!value) throw new Error('원본 없음');
      cacheHarness.files.delete(this.uri);
      cacheHarness.files.set(destination.uri, value);
      this.uri = destination.uri;
    }
  }

  class FakeDownloadTask {
    state = 'idle';
    target: FakeFile;
    url: string;

    constructor(url: string, target: FakeFile) {
      this.url = url;
      this.target = target;
    }

    static fromSavable(state: { fileUri: string; url: string }) {
      return new FakeDownloadTask(state.url, new FakeFile(state.fileUri));
    }

    async downloadAsync() {
      return this.finish();
    }

    async resumeAsync() {
      return this.finish();
    }

    private finish() {
      if (cacheHarness.failedDownloadUrls.has(this.url)) {
        throw new Error('다운로드 실패');
      }
      cacheHarness.files.set(this.target.uri, {
        size: cacheHarness.downloadSize,
        text: '',
        valid: true,
      });
      return this.target;
    }

    cancel() {}

    pause() {}

    savable() {
      return { resumeData: String(this.target.size) };
    }

    release() {}
  }

  return {
    Directory: FakeDirectory,
    DownloadTask: FakeDownloadTask,
    File: FakeFile,
    Paths: { cache: 'file:///cache' },
  };
});

const SHA256 = 'a'.repeat(64);
const VERSION_CODE = 47;
const BASE_URI = 'file:///cache/alarmpyo-updates';
const uri = (name: string) => `${BASE_URI}/${name}`;
const release: ApkReleaseManifest = {
  schemaVersion: 1,
  packageName: 'com.personal.alarmpyo',
  versionCode: VERSION_CODE,
  versionName: '1.6.0',
  sha256: SHA256,
  sizeBytes: 100,
  apkUrl: 'https://releases.example.com/AlarmPyo.apk',
  apkMirrors: [],
  artifactExpiresAt: null,
  publishedAt: '2026-08-09T00:00:00.000Z',
  notes: [],
};

function put(
  name: string,
  value: Partial<{ size: number; text: string; valid: boolean }> = {},
) {
  cacheHarness.files.set(uri(name), {
    size: value.size ?? 1,
    text: value.text ?? '',
    valid: value.valid ?? false,
  });
}

beforeEach(() => {
  cacheHarness.files.clear();
  cacheHarness.deleteFailures.clear();
  cacheHarness.moveFailures.clear();
  cacheHarness.failedDownloadUrls.clear();
  cacheHarness.downloadSize = 100;
});

describe('APK 업데이트 캐시 전환', () => {
  it('검증된 새 계보 APK 캐시를 그대로 사용해요', async () => {
    put('AlarmPyo_47.apk', { size: 100, valid: true });

    await expect(downloadApkUpdate(release)).resolves.toBe(uri('AlarmPyo_47.apk'));
    expect(cacheHarness.files.has(uri('AlarmPyo_47.apk'))).toBe(true);
  });

  it('검증에 실패한 새 계보 캐시를 이전 계보 캐시로 대체하지 않아요', async () => {
    put('AlarmPyo_47.apk', { size: 100, valid: false });
    put('OldApp_47.apk', { size: 100, valid: true });

    await expect(findCachedApkUpdate(release)).resolves.toBeNull();
    expect(cacheHarness.files.has(uri('OldApp_47.apk'))).toBe(true);
  });

  it('완성된 부분 파일 이동이 실패하면 원본을 보존해요', async () => {
    put('AlarmPyo_47.apk.part', { size: 100, valid: true });
    put('AlarmPyo_47.apk.resume.json', { text: '{}' });
    cacheHarness.moveFailures.add(uri('AlarmPyo_47.apk.part'));

    await expect(downloadApkUpdate(release)).rejects.toThrow('다시 시도');
    expect(cacheHarness.files.has(uri('AlarmPyo_47.apk.part'))).toBe(true);
    expect(cacheHarness.files.has(uri('AlarmPyo_47.apk.resume.json'))).toBe(true);
  });

  it('유효한 새 계보 이어받기 상태에서 다운로드를 계속해요', async () => {
    put('AlarmPyo_47.apk.part', { size: 40, valid: true });
    put('AlarmPyo_47.apk.resume.json', {
      text: JSON.stringify({
        schemaVersion: 1,
        versionCode: VERSION_CODE,
        url: release.apkUrl,
        fileUri: uri('AlarmPyo_47.apk.part'),
        sizeBytes: release.sizeBytes,
        resumeData: '40',
        updatedAt: '2026-08-09T00:00:00.000Z',
      }),
    });

    await expect(downloadApkUpdate(release)).resolves.toBe(uri('AlarmPyo_47.apk'));
    expect(cacheHarness.files.has(uri('AlarmPyo_47.apk'))).toBe(true);
    expect(cacheHarness.files.has(uri('AlarmPyo_47.apk.part'))).toBe(false);
  });

  it('첫 URL이 실패하면 다음 미러를 같은 새 계보 파일로 받아요', async () => {
    const mirror = 'https://mirror.example.com/AlarmPyo.apk';
    const releaseWithMirror = { ...release, apkMirrors: [mirror] };
    cacheHarness.failedDownloadUrls.add(release.apkUrl);

    await expect(downloadApkUpdate(releaseWithMirror)).resolves.toBe(
      uri('AlarmPyo_47.apk'),
    );
    expect(cacheHarness.files.has(uri('AlarmPyo_47.apk'))).toBe(true);
  });
});
