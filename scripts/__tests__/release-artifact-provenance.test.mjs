import { describe, expect, it } from 'vitest';

import {
  assertAndroidDeviceMatrixBinding,
  normalizeEasBuildProvenance,
} from '../release-artifact-provenance.mjs';

const SOURCE_COMMIT = 'a'.repeat(40);
const APK_SHA256 = 'b'.repeat(64);
const NATIVE_FINGERPRINT = 'c'.repeat(64);
const EAS_BUILD_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_EAS_BUILD_ID = '22222222-2222-4222-8222-222222222222';
const BUILD_FINISHED_AT = '2026-08-09T10:00:00.000Z';
const MATRIX_CHECKED_AT = '2026-08-09T11:00:00.000Z';
const NOW = Date.parse('2026-08-09T12:00:00.000Z');

const expectedBuild = {
  buildProfile: 'stable',
  versionName: '1.0.0',
  versionCode: 1,
  projectId: '7f83e3d7-2b95-42a5-9ab9-e4eec4aa1c3e',
};

function createEasBuild(overrides = {}) {
  return {
    id: EAS_BUILD_ID,
    status: 'FINISHED',
    platform: 'ANDROID',
    buildProfile: 'stable',
    gitCommitHash: SOURCE_COMMIT.toUpperCase(),
    appVersion: '1.0.0',
    appBuildVersion: '1',
    completedAt: BUILD_FINISHED_AT,
    artifacts: {
      buildUrl: 'https://expo.dev/artifacts/eas/alarmpyo-release.apk',
    },
    project: {
      id: expectedBuild.projectId,
    },
    ...overrides,
  };
}

function createManifest() {
  return {
    schemaVersion: 1,
    packageName: 'com.personal.alarmpyo',
    versionName: '1.0.0',
    versionCode: 1,
    sha256: APK_SHA256,
    sourceCommit: SOURCE_COMMIT,
    easBuildId: EAS_BUILD_ID,
    nativeFingerprint: NATIVE_FINGERPRINT,
    provenanceArtifactUrl: 'https://expo.dev/artifacts/eas/alarmpyo-release.apk',
    provenanceArtifactSha256: APK_SHA256,
    provenanceVerifiedAt: '2026-08-09T10:20:00.000Z',
    easBuildFinishedAt: BUILD_FINISHED_AT,
  };
}

const EVIDENCE_HASHES = {
  physical: 'd'.repeat(64),
  31: 'e'.repeat(64),
  33: 'f'.repeat(64),
  34: '1'.repeat(64),
  35: '2'.repeat(64),
  36: '3'.repeat(64),
};

function createEmulator(sdk, minute) {
  return {
    deviceType: 'emulator',
    sdk,
    avdName: `AlarmPyo API ${sdk}`,
    osVersion: `Android ${sdk - 19}`,
    buildFingerprint: `google/sdk_gphone${sdk}/fingerprint`,
    checkedAt: `2026-08-09T10:${String(minute).padStart(2, '0')}:00.000Z`,
    evidence: {
      path: `.release/device-evidence/emulator-api${sdk}.json`,
      sha256: EVIDENCE_HASHES[sdk],
    },
    installAndLaunch: true,
    dataMigration: true,
    alarmWhileClosed: true,
    alarmAfterReboot: true,
    blockedNotificationState: true,
    fullScreenAlarm: true,
    widgetAvailable: true,
  };
}

function createMatrix() {
  return {
    schemaVersion: 3,
    packageName: 'com.personal.alarmpyo',
    versionName: '1.0.0',
    versionCode: 1,
    apkSha256: APK_SHA256,
    sourceCommit: SOURCE_COMMIT,
    easBuildId: EAS_BUILD_ID,
    nativeFingerprint: NATIVE_FINGERPRINT,
    checkedAt: MATRIX_CHECKED_AT,
    physicalDevice: {
      deviceType: 'physical',
      currentSamsungDevice: true,
      sdk: 36,
      manufacturer: 'Samsung',
      model: 'Galaxy S25',
      osVersion: 'Android 16',
      buildFingerprint: 'samsung/pa3q/pa3q:16/build/fingerprint',
      checkedAt: '2026-08-09T10:05:00.000Z',
      evidence: {
        path: '.release/device-evidence/current-samsung.json',
        sha256: EVIDENCE_HASHES.physical,
      },
      upgradePreservedData: true,
      permissionsPreserved: true,
      alarmWhileClosed: true,
      alarmAfterReboot: true,
      blockedNotificationState: true,
      fullScreenAlarm: true,
      widgetAvailable: true,
    },
    emulators: [
      createEmulator(31, 10),
      createEmulator(33, 20),
      createEmulator(34, 30),
      createEmulator(35, 40),
      createEmulator(36, 50),
    ],
  };
}

function validationOptions() {
  return {
    now: NOW,
    verifiedEvidenceSha256s: new Set(Object.values(EVIDENCE_HASHES)),
  };
}

describe('EAS 빌드 출처 증명 정규화', () => {
  it('완료된 Android stable 빌드의 식별자와 APK 주소를 정규화해요', () => {
    expect(
      normalizeEasBuildProvenance(createEasBuild(), expectedBuild),
    ).toEqual({
      easBuildId: EAS_BUILD_ID,
      sourceCommit: SOURCE_COMMIT,
      artifactUrl: 'https://expo.dev/artifacts/eas/alarmpyo-release.apk',
      finishedAt: BUILD_FINISHED_AT,
    });
  });

  it.each([
    ['완료되지 않은 빌드', { status: 'IN_PROGRESS' }],
    ['다른 플랫폼', { platform: 'IOS' }],
    ['다른 빌드 프로필', { buildProfile: 'canary' }],
    ['잘못된 빌드 ID', { id: 'not-a-build-id' }],
    ['누락된 소스 커밋', { gitCommitHash: null }],
    [
      'HTTPS가 아닌 APK 주소',
      { artifacts: { buildUrl: 'http://example.com/alarmpyo.apk' } },
    ],
    ['다른 앱 버전', { appBuildVersion: '2' }],
    ['다른 Expo 프로젝트', { project: { id: 'other-project' } }],
    ['잘못된 완료 시각', { completedAt: 'not-a-date' }],
  ])('%s는 출처 증명으로 사용할 수 없어요', (_label, overrides) => {
    expect(() =>
      normalizeEasBuildProvenance(createEasBuild(overrides), expectedBuild),
    ).toThrow();
  });
});

describe('Samsung 실기기·Android 12~16 에뮬레이터 매트릭스 바인딩', () => {
  it('같은 APK와 EAS 빌드에 묶인 물리·에뮬레이터 증거를 승인해요', () => {
    expect(
      assertAndroidDeviceMatrixBinding(
        createMatrix(),
        createManifest(),
        validationOptions(),
      ),
    ).toEqual({
      apkSha256: APK_SHA256,
      sourceCommit: SOURCE_COMMIT,
      easBuildId: EAS_BUILD_ID,
      nativeFingerprint: NATIVE_FINGERPRINT,
      checkedAt: MATRIX_CHECKED_AT,
      physicalEvidenceSha256: EVIDENCE_HASHES.physical,
      emulatorEvidence: [31, 33, 34, 35, 36].map((sdk) => ({
        sdk,
        sha256: EVIDENCE_HASHES[sdk],
      })),
    });
  });

  it('staged manifest와 APK 해시가 다르면 거부해요', () => {
    const matrix = createMatrix();
    matrix.apkSha256 = 'd'.repeat(64);

    expect(() =>
      assertAndroidDeviceMatrixBinding(
        matrix,
        createManifest(),
        validationOptions(),
      ),
    ).toThrow();
  });

  it('staged manifest와 EAS 빌드 ID가 다르면 거부해요', () => {
    const matrix = createMatrix();
    matrix.easBuildId = OTHER_EAS_BUILD_ID;

    expect(() =>
      assertAndroidDeviceMatrixBinding(
        matrix,
        createManifest(),
        validationOptions(),
      ),
    ).toThrow();
  });

  it('EAS 빌드가 끝나기 전에 기록된 검증이면 거부해요', () => {
    const matrix = createMatrix();
    matrix.checkedAt = '2026-08-09T09:00:00.000Z';
    matrix.physicalDevice.checkedAt = '2026-08-09T08:50:00.000Z';
    matrix.emulators = matrix.emulators.map((device) => ({
      ...device,
      checkedAt: '2026-08-09T08:50:00.000Z',
    }));

    expect(() =>
      assertAndroidDeviceMatrixBinding(
        matrix,
        createManifest(),
        validationOptions(),
      ),
    ).toThrow();
  });

  it('Samsung 실기기를 에뮬레이터로 표시하면 거부해요', () => {
    const matrix = createMatrix();
    matrix.physicalDevice.deviceType = 'emulator';

    expect(() =>
      assertAndroidDeviceMatrixBinding(
        matrix,
        createManifest(),
        validationOptions(),
      ),
    ).toThrow();
  });

  it('API 36 에뮬레이터가 빠지면 거부해요', () => {
    const matrix = createMatrix();
    matrix.emulators = matrix.emulators.filter((device) => device.sdk !== 36);

    expect(() =>
      assertAndroidDeviceMatrixBinding(
        matrix,
        createManifest(),
        validationOptions(),
      ),
    ).toThrow();
  });

  it('해시로 확인한 원본 증거가 없으면 거부해요', () => {
    expect(() =>
      assertAndroidDeviceMatrixBinding(createMatrix(), createManifest(), {
        now: NOW,
        verifiedEvidenceSha256s: new Set(),
      }),
    ).toThrow();
  });
});
