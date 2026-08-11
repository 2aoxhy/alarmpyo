import { describe, expect, it } from 'vitest';

import { assertDeploySourceState } from '../deploy-source-policy.mjs';

describe('웹 배포 소스 정책', () => {
  it('직접 배포는 변경이 없는 커밋만 허용해요', () => {
    expect(() =>
      assertDeploySourceState({ changes: [], releaseTransaction: false }),
    ).not.toThrow();
    expect(() =>
      assertDeploySourceState({
        changes: ['src/app/index.tsx'],
        releaseTransaction: false,
      }),
    ).toThrow('커밋되지 않은 변경');
  });

  it('APK 승격은 두 배포 정보 파일 외의 변경을 거부해요', () => {
    expect(() =>
      assertDeploySourceState({
        changes: [
          'public/updates/latest-android.json',
          'public/updates/previous-android.json',
        ],
        releaseTransaction: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertDeploySourceState({
        changes: ['public/updates/latest-android.json', 'app.json'],
        releaseTransaction: true,
      }),
    ).toThrow('허용되지 않은 변경');
  });

  it('manifest가 가리키는 APK 파일 하나만 추가로 허용해요', () => {
    const expectedApk = 'public/downloads/v1/AlarmPyo_20260809.apk';
    expect(() =>
      assertDeploySourceState({
        allowedReleasePaths: [expectedApk],
        changes: [
          'public/updates/latest-android.json',
          'public/updates/previous-android.json',
          expectedApk,
        ],
        releaseTransaction: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertDeploySourceState({
        allowedReleasePaths: [expectedApk],
        changes: ['public/downloads/v1/AlarmPyo_20260808.apk'],
        releaseTransaction: true,
      }),
    ).toThrow('허용되지 않은 변경');
  });

  it('승격 트랜잭션에서 명시한 후보 폴더만 변경하도록 허용해요', () => {
    expect(() =>
      assertDeploySourceState({
        allowedReleasePaths: ['docs/release-ledger.json'],
        allowedReleasePrefixes: [
          'public/downloads/v2/',
          'public/downloads/v3/',
        ],
        changes: [
          'docs/release-ledger.json',
          'public/downloads/v2/AlarmPyo_20260809.apk',
          'public/downloads/v3/AlarmPyo_20260809.apk',
        ],
        releaseTransaction: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertDeploySourceState({
        allowedReleasePrefixes: ['public/downloads/v2/'],
        changes: ['public/downloads/v1/AlarmPyo_20260809.apk'],
        releaseTransaction: true,
      }),
    ).toThrow('허용되지 않은 변경');
  });
});
