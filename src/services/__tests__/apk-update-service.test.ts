import { describe, expect, it } from 'vitest';

import {
  collectHttpsUrlCandidates,
  formatApkSize,
  getApkDownloadUrls,
  parseApkReleaseManifest,
} from '../apk-update-manifest';

const VALID_MANIFEST = {
  schemaVersion: 1,
  packageName: 'com.personal.alarmpyo',
  versionCode: 22,
  versionName: '1.2.1',
  apkUrl: 'https://expo.dev/artifacts/eas/example.apk',
  apkMirrors: [
    'https://releases.example.com/alarmpyo/ALARMPYO_20260713.apk',
    'https://mirror.example.com/alarmpyo/ALARMPYO_20260713.apk',
  ],
  sha256: 'a'.repeat(64),
  sizeBytes: 110_224_719,
  publishedAt: '2026-07-13T12:00:00.000Z',
  artifactExpiresAt: '2026-10-11T12:00:00.000Z',
  notes: ['APK 업데이트를 지원해요.'],
};

describe('APK 업데이트 정보', () => {
  it('정상 배포 정보를 읽습니다', () => {
    expect(parseApkReleaseManifest(VALID_MANIFEST)).toEqual(VALID_MANIFEST);
  });

  it('기존 단일 주소 배포 정보도 계속 읽습니다', () => {
    const { apkMirrors: _apkMirrors, artifactExpiresAt: _expiresAt, ...legacy } =
      VALID_MANIFEST;
    expect(parseApkReleaseManifest(legacy)).toMatchObject({
      apkMirrors: [],
      artifactExpiresAt: null,
    });
  });

  it('다른 패키지와 안전하지 않은 주소를 거부합니다', () => {
    expect(() =>
      parseApkReleaseManifest({ ...VALID_MANIFEST, packageName: 'other.app' }),
    ).toThrow('앱 업데이트 정보가 올바르지 않습니다.');
    expect(() =>
      parseApkReleaseManifest({ ...VALID_MANIFEST, apkUrl: 'http://example.com/app.apk' }),
    ).toThrow('앱 업데이트 정보가 올바르지 않습니다.');
  });

  it('잘못된 해시와 비정상 파일 크기를 거부합니다', () => {
    expect(() =>
      parseApkReleaseManifest({ ...VALID_MANIFEST, sha256: 'abc' }),
    ).toThrow('앱 업데이트 정보가 올바르지 않습니다.');
    expect(() =>
      parseApkReleaseManifest({ ...VALID_MANIFEST, sizeBytes: 100 }),
    ).toThrow('앱 업데이트 정보가 올바르지 않습니다.');
  });

  it('APK 크기를 읽기 쉽게 표시합니다', () => {
    expect(formatApkSize(110_100_480)).toBe('105.0MB');
  });

  it('기본 주소가 실패하면 사용할 APK 미러 순서를 보존합니다', () => {
    const release = parseApkReleaseManifest(VALID_MANIFEST);
    expect(getApkDownloadUrls(release)).toEqual([
      VALID_MANIFEST.apkUrl,
      ...VALID_MANIFEST.apkMirrors,
    ]);
  });

  it('임시 기본 주소가 만료되면 장기 보관 미러부터 사용합니다', () => {
    const release = parseApkReleaseManifest(VALID_MANIFEST);
    expect(
      getApkDownloadUrls(release, Date.parse('2026-10-12T12:00:00.000Z')),
    ).toEqual(VALID_MANIFEST.apkMirrors);
  });

  it('중복 APK 미러를 제거하고 안전하지 않은 미러를 거부합니다', () => {
    const release = parseApkReleaseManifest({
      ...VALID_MANIFEST,
      apkMirrors: [VALID_MANIFEST.apkUrl, VALID_MANIFEST.apkMirrors[0]],
    });
    expect(release.apkMirrors).toEqual([VALID_MANIFEST.apkMirrors[0]]);
    expect(() =>
      parseApkReleaseManifest({
        ...VALID_MANIFEST,
        apkMirrors: ['http://example.com/ALARMPYO.apk'],
      }),
    ).toThrow('앱 업데이트 정보가 올바르지 않습니다.');
  });

  it('배포 정보 주소의 중복과 안전하지 않은 주소를 정리합니다', () => {
    expect(
      collectHttpsUrlCandidates(
        [
          'https://primary.example.com/latest.json',
          'http://unsafe.example.com/latest.json',
        ],
        'https://primary.example.com/latest.json',
        'https://fallback.example.com/latest.json',
      ),
    ).toEqual([
      'https://primary.example.com/latest.json',
      'https://fallback.example.com/latest.json',
    ]);
  });

  it('새 배포 주소를 연결하기 전에는 기본 서버를 추측하지 않아요', () => {
    expect(collectHttpsUrlCandidates(undefined, undefined)).toEqual([]);
  });
});
