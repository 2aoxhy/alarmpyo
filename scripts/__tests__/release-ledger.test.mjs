import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import {
  appendApkLedgerEntry,
  appendOtaLedgerEntry,
  assertDurableApkMirrors,
  assertLedgerTracksCurrentRelease,
  createApkLedgerEntry,
  readReleaseLedger,
} from '../release-ledger.mjs';

const root = resolve(import.meta.dirname, '..', '..');

const CURRENT_SHA = 'a'.repeat(64);
const NEW_SHA = 'b'.repeat(64);

function ledger() {
  return {
    schemaVersion: 1,
    packageName: 'com.personal.alarmpyo',
    apkReleases: [
      createApkLedgerEntry(
        {
          versionName: '1.0.0',
          versionCode: 1,
          sha256: CURRENT_SHA,
          sizeBytes: 100,
          apkUrl: 'https://releases.example.com/alarmpyo/v1/AlarmPyo.apk',
          apkMirrors: ['https://mirror.example.com/alarmpyo/v1.apk'],
          sourceCommit: 'a'.repeat(40),
          easBuildId: '22222222-2222-4222-8222-222222222222',
          nativeFingerprint: 'f'.repeat(64),
        },
        matrixBinding({
          apkSha256: CURRENT_SHA,
          sourceCommit: 'a'.repeat(40),
          easBuildId: '22222222-2222-4222-8222-222222222222',
          nativeFingerprint: 'f'.repeat(64),
        }),
        '2026-08-08T19:41:28.357Z',
      ),
    ],
    otaPromotions: [],
  };
}

function candidateManifest() {
  return {
    versionName: '1.0.1',
    versionCode: 2,
    sha256: NEW_SHA,
    sizeBytes: 200,
    apkUrl: 'https://releases.example.com/alarmpyo/v2/AlarmPyo.apk',
    apkMirrors: ['https://mirror.example.com/alarmpyo/v2.apk'],
    sourceCommit: 'c'.repeat(40),
    easBuildId: '11111111-1111-4111-8111-111111111111',
    nativeFingerprint: 'd'.repeat(64),
  };
}

function matrixBinding(overrides = {}) {
  return {
    apkSha256: NEW_SHA,
    sourceCommit: 'c'.repeat(40),
    easBuildId: '11111111-1111-4111-8111-111111111111',
    nativeFingerprint: 'd'.repeat(64),
    checkedAt: '2026-08-09T11:00:00.000Z',
    physicalEvidenceSha256: 'e'.repeat(64),
    emulatorEvidence: [31, 33, 34, 35, 36].map((sdk) => ({
      sdk,
      sha256: String(sdk % 10).repeat(64),
    })),
    ...overrides,
  };
}

describe('지속 가능한 릴리스 원장', () => {
  it('AlarmPyo 원장이 이전 앱 기록 없이 빈 계보로 시작해요', async () => {
    const value = await readReleaseLedger(root);
    expect(value).toMatchObject({
      packageName: 'com.personal.alarmpyo',
      apkReleases: [],
      otaPromotions: [],
    });
  });

  it('빈 원장에는 완전히 검증된 1.0.1(2)만 첫 기록으로 추가해요', () => {
    const empty = {
      schemaVersion: 1,
      packageName: 'com.personal.alarmpyo',
      apkReleases: [],
      otaPromotions: [],
    };
    const first = createApkLedgerEntry(
      candidateManifest(),
      matrixBinding(),
      '2026-08-09T12:00:00.000Z',
    );
    expect(appendApkLedgerEntry(empty, first).apkReleases).toEqual([first]);
    expect(() =>
      appendApkLedgerEntry(empty, {
        ...first,
        evidenceLevel: 'legacy',
      }),
    ).toThrow('올바르지 않은 APK 기록');
  });

  it('현재 v1 운영본을 원장과 대조한 뒤 검증된 1.0.1 기록을 추가해요', () => {
    const current = {
      packageName: 'com.personal.alarmpyo',
      versionName: '1.0.0',
      versionCode: 1,
      sha256: CURRENT_SHA,
      apkUrl: 'https://releases.example.com/alarmpyo/v1/AlarmPyo.apk',
    };
    expect(
      assertLedgerTracksCurrentRelease(ledger(), current).versionCode,
    ).toBe(1);

    const entry = createApkLedgerEntry(
      candidateManifest(),
      matrixBinding(),
      '2026-08-09T12:00:00.000Z',
    );
    const next = appendApkLedgerEntry(ledger(), entry);
    expect(next.apkReleases.map((item) => item.versionCode)).toEqual([1, 2]);
    expect(next.apkReleases[1].deviceMatrix.emulatorEvidence).toHaveLength(5);
  });

  it('별도 HTTPS 미러가 없는 APK 후보는 승격 원장을 만들 수 없어요', () => {
    expect(() =>
      assertDurableApkMirrors({
        apkUrl: 'https://releases.example.com/alarmpyo/v2/AlarmPyo.apk',
        apkMirrors: [],
      }),
    ).toThrow('미러');
    expect(() =>
      assertDurableApkMirrors({
        apkUrl: 'https://releases.example.com/alarmpyo/v2/AlarmPyo.apk',
        apkMirrors: ['https://expo.dev/artifacts/eas/candidate.apk'],
      }),
    ).toThrow('장기 보관');
  });

  it('현재 운영 manifest와 원장이 다르면 승격을 막아요', () => {
    expect(() =>
      assertLedgerTracksCurrentRelease(ledger(), {
        packageName: 'com.personal.alarmpyo',
        versionName: '1.0.0',
        versionCode: 1,
        sha256: 'f'.repeat(64),
        apkUrl: 'https://releases.example.com/alarmpyo/v1/AlarmPyo.apk',
      }),
    ).toThrow('원장');
  });

  it('검증된 후보 브랜치의 채널 승격만 OTA 원장에 추가해요', () => {
    const entry = {
      channel: 'stable',
      previousBranch: 'stable',
      candidateBranch: `release-candidate-stable-${'a'.repeat(12)}-1`,
      versionName: '1.0.1',
      versionCode: 2,
      sourceCommit: 'c'.repeat(40),
      baseApkSha256: NEW_SHA,
      groups: ['group-1'],
      promotedAt: '2026-08-09T12:00:00.000Z',
    };
    const baseLedger = appendApkLedgerEntry(
      ledger(),
      createApkLedgerEntry(
        candidateManifest(),
        matrixBinding(),
        '2026-08-09T11:30:00.000Z',
      ),
    );
    const next = appendOtaLedgerEntry(baseLedger, entry);
    expect(next.otaPromotions).toEqual([entry]);
    expect(() => appendOtaLedgerEntry(next, entry)).toThrow('이미');
  });
});
