import { describe, expect, it } from 'vitest';

import {
  getApkUpdateCacheFileNames,
  isApkManifestCacheFresh,
  shouldDeleteApkCacheFile,
} from '../apk-update-cache-policy';

describe('APK 캐시 이름 계약', () => {
  it('AlarmPyo 계보의 캐시 이름만 만들어요', () => {
    expect(getApkUpdateCacheFileNames(47)).toEqual({
      completed: 'AlarmPyo_47.apk',
      partial: 'AlarmPyo_47.apk.part',
      resume: 'AlarmPyo_47.apk.resume.json',
    });
  });

  it('잘못된 버전 코드로 캐시 경로를 만들지 않아요', () => {
    expect(() => getApkUpdateCacheFileNames(0)).toThrow(RangeError);
    expect(() => getApkUpdateCacheFileNames(Number.NaN)).toThrow(RangeError);
  });
});

describe('APK 업데이트 캐시 정리', () => {
  it('현재보다 미래에 기록된 매니페스트 캐시는 사용하지 않아요', () => {
    const now = Date.parse('2026-07-30T00:00:00.000Z');
    expect(
      isApkManifestCacheFresh('2026-07-29T23:00:00.000Z', now, 86_400_000),
    ).toBe(true);
    expect(
      isApkManifestCacheFresh('2026-07-30T00:00:01.000Z', now, 86_400_000),
    ).toBe(false);
  });

  it('현재 배포의 부분 다운로드와 이어받기 정보는 유지해요', () => {
    expect(shouldDeleteApkCacheFile('AlarmPyo_24.apk.part', 22, 24)).toBe(false);
    expect(
      shouldDeleteApkCacheFile('AlarmPyo_24.apk.resume.json', 22, 24),
    ).toBe(false);
  });

  it('설치된 버전 이하와 현재 배포가 아닌 새 계보 APK를 정리해요', () => {
    expect(shouldDeleteApkCacheFile('AlarmPyo_22.apk', 22, 24)).toBe(true);
    expect(shouldDeleteApkCacheFile('AlarmPyo_23.apk', 22, 24)).toBe(true);
    expect(shouldDeleteApkCacheFile('AlarmPyo_23.apk.part', 22, 24)).toBe(true);
    expect(
      shouldDeleteApkCacheFile('AlarmPyo_23.apk.resume.json', 22, 24),
    ).toBe(true);
  });

  it('이전 앱 계보의 캐시와 관계없는 파일은 건드리지 않아요', () => {
    expect(shouldDeleteApkCacheFile('OldApp_24.apk', 22, 24)).toBe(false);
    expect(shouldDeleteApkCacheFile('OldApp_24.apk.part', 22, 24)).toBe(false);
    expect(shouldDeleteApkCacheFile('readme.txt', 22, 24)).toBe(false);
  });
});
