import { describe, expect, it } from 'vitest';

import {
  REQUIRED_PLAY_16KB_CHECKS,
  REQUIRED_PLAY_PHYSICAL_CHECKS,
  assertPlayReleaseEvidence,
} from '../play-release-evidence.mjs';

const AAB_SHA256 = 'a'.repeat(64);
const SIGNER_SHA256 = 'b'.repeat(64);
const SOURCE_COMMIT = 'c'.repeat(40);
const EAS_BUILD_ID = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-08-12T12:00:00.000Z');

function allChecks(names) {
  return Object.fromEntries(names.map((name) => [name, true]));
}

function artifact(overrides = {}) {
  return {
    schemaVersion: 1,
    artifactType: 'android-app-bundle',
    distribution: 'play',
    releasePurpose: 'play-release',
    submissionEligible: true,
    signed: true,
    sourceDirty: false,
    packageName: 'com.personal.alarmpyo',
    versionName: '1.0.1',
    versionCode: 2,
    sha256: AAB_SHA256,
    sourceCommit: SOURCE_COMMIT,
    easBuildId: EAS_BUILD_ID,
    easBuildFinishedAt: '2026-08-12T09:00:00.000Z',
    pageAlignment: 'PAGE_ALIGNMENT_16K',
    ...overrides,
  };
}

function boundFields() {
  return {
    packageName: 'com.personal.alarmpyo',
    versionName: '1.0.1',
    versionCode: 2,
    aabSha256: AAB_SHA256,
    sourceCommit: SOURCE_COMMIT,
    easBuildId: EAS_BUILD_ID,
  };
}

function releaseEvidence(overrides = {}) {
  return {
    schemaVersion: 1,
    ...boundFields(),
    appSigningCertificateSha256: SIGNER_SHA256,
    highestPreviouslyDistributedVersionCode: 0,
    highestExistingPlayVersionCode: 0,
    track: 'internal',
    checkedAt: '2026-08-12T11:30:00.000Z',
    ...overrides,
  };
}

function rawEvidence() {
  return {
    physicalDevice: {
      schemaVersion: 1,
      evidenceType: 'play-physical-device',
      captureMethod: 'adb-and-play-console',
      ...boundFields(),
      checkedAt: '2026-08-12T10:00:00.000Z',
      device: {
        deviceType: 'physical',
        currentSamsungDevice: true,
        manufacturer: 'Samsung',
        model: 'Galaxy test device',
        sdk: 36,
        buildFingerprint: 'samsung/test/fingerprint',
        installerPackageName: 'com.android.vending',
        signingCertificateSha256: SIGNER_SHA256,
      },
      checks: allChecks(REQUIRED_PLAY_PHYSICAL_CHECKS),
    },
    pageSize16KbDevice: {
      schemaVersion: 1,
      evidenceType: 'play-16kb-device',
      captureMethod: 'adb-and-play-console',
      ...boundFields(),
      checkedAt: '2026-08-12T10:30:00.000Z',
      device: {
        deviceType: 'emulator',
        sdk: 35,
        pageSizeBytes: 16384,
        buildFingerprint: 'google/test/16kb',
      },
      delivery: {
        source: 'play-app-bundle-explorer',
        splitApks: true,
        zipalign16Kb: true,
        elfLoadSegments16Kb: true,
        signingCertificateSha256: SIGNER_SHA256,
      },
      checks: allChecks(REQUIRED_PLAY_16KB_CHECKS),
    },
    preLaunchReport: {
      schemaVersion: 1,
      evidenceType: 'play-pre-launch-report',
      captureMethod: 'play-console',
      ...boundFields(),
      completedAt: '2026-08-12T11:00:00.000Z',
      status: 'completed',
      categories: Object.fromEntries(
        ['stability', 'compatibility', 'performance', 'accessibility'].map(
          (name) => [name, { blockingIssueCount: 0 }],
        ),
      ),
    },
  };
}

const playPolicy = {
  appSigningCertificateSha256: SIGNER_SHA256,
};

describe('Play 최종 출고 증거', () => {
  it('같은 AAB·EAS 빌드·AlarmPyo 인증서에 묶인 실제 기기 증거만 통과해요', () => {
    expect(
      assertPlayReleaseEvidence(
        releaseEvidence(),
        artifact(),
        playPolicy,
        rawEvidence(),
        { now: NOW },
      ),
    ).toMatchObject({
      aabSha256: AAB_SHA256,
      versionCode: 2,
      appSigningCertificateSha256: SIGNER_SHA256,
    });
  });

  it('별도 Play 서명 계보는 불가능한 direct 교차 업데이트를 요구하지 않아요', () => {
    const evidence = rawEvidence();
    evidence.physicalDevice.checks.directApkUpgrade = false;
    evidence.physicalDevice.checks.dataPreserved = false;
    evidence.physicalDevice.checks.permissionsPreserved = false;

    expect(
      assertPlayReleaseEvidence(
        releaseEvidence(),
        artifact(),
        { ...playPolicy, directUpgradeCompatible: false },
        evidence,
        { now: NOW },
      ),
    ).toMatchObject({ directUpgradeCompatible: false });
  });

  it('서명 확인용 부트스트랩 AAB 출처는 최종 출고 증거로 거부해요', () => {
    expect(() =>
      assertPlayReleaseEvidence(
        releaseEvidence(),
        artifact({
          releasePurpose: 'play-signing-bootstrap',
          submissionEligible: false,
        }),
        { ...playPolicy, directUpgradeCompatible: false },
        rawEvidence(),
        { now: NOW },
      ),
    ).toThrow('부트스트랩 AAB');
  });

  it('direct와 같은 서명 계보에서는 교차 업데이트 검사를 계속 요구해요', () => {
    const evidence = rawEvidence();
    evidence.physicalDevice.checks.directApkUpgrade = false;

    expect(() =>
      assertPlayReleaseEvidence(
        releaseEvidence(),
        artifact(),
        { ...playPolicy, directUpgradeCompatible: true },
        evidence,
        { now: NOW },
      ),
    ).toThrow('directApkUpgrade');
  });

  it('AlarmPyo 정책과 다른 Play 앱 서명 인증서는 거부해요', () => {
    expect(() =>
      assertPlayReleaseEvidence(
        releaseEvidence({ appSigningCertificateSha256: 'd'.repeat(64) }),
        artifact(),
        playPolicy,
        rawEvidence(),
        { now: NOW },
      ),
    ).toThrow('Play 배포 정책 인증서');
  });

  it('실제 유통 또는 Play Console 최고 versionCode보다 크지 않으면 거부해요', () => {
    expect(() =>
      assertPlayReleaseEvidence(
        releaseEvidence({ highestPreviouslyDistributedVersionCode: 2 }),
        artifact(),
        playPolicy,
        rawEvidence(),
        { now: NOW },
      ),
    ).toThrow('실제 유통 최고 versionCode');
  });

  it('16KB AAB·split APK·런타임 증거 중 하나라도 빠지면 거부해요', () => {
    expect(() =>
      assertPlayReleaseEvidence(
        releaseEvidence(),
        artifact({ pageAlignment: 'PAGE_ALIGNMENT_4K' }),
        playPolicy,
        rawEvidence(),
        { now: NOW },
      ),
    ).toThrow('PAGE_ALIGNMENT_16K');

    const evidence = rawEvidence();
    evidence.pageSize16KbDevice.delivery.zipalign16Kb = false;
    expect(() =>
      assertPlayReleaseEvidence(
        releaseEvidence(),
        artifact(),
        playPolicy,
        evidence,
        { now: NOW },
      ),
    ).toThrow('ZIP·ELF 16KB');
  });

  it('사전 출시 보고서의 차단 문제가 남으면 거부해요', () => {
    const evidence = rawEvidence();
    evidence.preLaunchReport.categories.stability.blockingIssueCount = 1;
    expect(() =>
      assertPlayReleaseEvidence(
        releaseEvidence(),
        artifact(),
        playPolicy,
        evidence,
        { now: NOW },
      ),
    ).toThrow('stability 차단 문제');
  });
});
