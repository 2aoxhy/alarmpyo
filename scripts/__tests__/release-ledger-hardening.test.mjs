import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  appendApkLedgerEntry,
  appendOtaLedgerEntry,
  assertLedgerTracksCurrentRelease,
  createApkLedgerEntry,
} from '../release-ledger.mjs';

const BASE_SHA = 'a'.repeat(64);
const CANDIDATE_SHA = 'b'.repeat(64);

function baseLedger() {
  return {
    schemaVersion: 1,
    packageName: 'com.personal.alarmpyo',
    apkReleases: [
      verifiedApkEntry({
        versionName: '1.0.0',
        versionCode: 1,
        sha256: BASE_SHA,
        sourceCommit: 'a'.repeat(40),
        easBuildId: '22222222-2222-4222-8222-222222222222',
        nativeFingerprint: 'f'.repeat(64),
      }),
    ],
    otaPromotions: [],
  };
}

function verifiedApkEntry({
  versionName = '1.0.1',
  versionCode = 2,
  sha256 = CANDIDATE_SHA,
  sourceCommit = 'c'.repeat(40),
  easBuildId = '11111111-1111-4111-8111-111111111111',
  nativeFingerprint = 'd'.repeat(64),
} = {}) {
  return createApkLedgerEntry(
    {
      versionName,
      versionCode,
      sha256,
      sizeBytes: 200,
      apkUrl: `https://releases.example.com/alarmpyo/v${versionCode}/AlarmPyo.apk`,
      apkMirrors: [
        `https://mirror.example.com/alarmpyo/v${versionCode}.apk`,
      ],
      sourceCommit,
      easBuildId,
      nativeFingerprint,
    },
    {
      apkSha256: sha256,
      sourceCommit,
      easBuildId,
      nativeFingerprint,
      checkedAt: '2026-08-09T11:00:00.000Z',
      physicalEvidenceSha256: 'e'.repeat(64),
      emulatorEvidence: [31, 33, 34, 35, 36].map((sdk) => ({
        sdk,
        sha256: String(sdk % 10).repeat(64),
      })),
    },
    '2026-08-09T11:30:00.000Z',
  );
}

function otaEntry(overrides = {}) {
  return {
    channel: 'stable',
    previousBranch: 'stable',
    candidateBranch: `release-candidate-stable-${'a'.repeat(12)}-2`,
    versionName: '1.0.1',
    versionCode: 2,
    sourceCommit: 'c'.repeat(40),
    baseApkSha256: CANDIDATE_SHA,
    groups: ['group-2'],
    promotedAt: '2026-08-09T12:00:00.000Z',
    ...overrides,
  };
}

describe('릴리스 원장 증거 결합', () => {
  it('원장 스키마가 OTA 원본 APK 해시와 검증 기기 증거를 요구해요', () => {
    const schema = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '..', '..', 'docs', 'release-ledger.schema.json'),
        'utf8',
      ),
    );
    const otaRequired = schema.properties.otaPromotions.items.required;
    const verifiedRequirements = schema.properties.apkReleases.items.required;
    expect(otaRequired).toContain('baseApkSha256');
    expect(verifiedRequirements).toContain('deviceMatrix');
    expect(
      schema.properties.apkReleases.items.properties.evidenceLevel.const,
    ).toBe('verified-v3');
  });

  it('OTA 기록을 같은 버전의 APK 해시와 결합해요', () => {
    const ledger = appendApkLedgerEntry(baseLedger(), verifiedApkEntry());
    expect(appendOtaLedgerEntry(ledger, otaEntry()).otaPromotions).toHaveLength(1);
    expect(() =>
      appendOtaLedgerEntry(
        ledger,
        otaEntry({ baseApkSha256: 'f'.repeat(64) }),
      ),
    ).toThrow('APK');
  });

  it('OTA 원본 APK 해시가 빠지면 거부해요', () => {
    const ledger = appendApkLedgerEntry(baseLedger(), verifiedApkEntry());
    const entry = otaEntry();
    delete entry.baseApkSha256;
    expect(() => appendOtaLedgerEntry(ledger, entry)).toThrow();
  });

  it('검증 완료 APK 기록에서 기기 증거가 빠지면 거부해요', () => {
    for (const field of [
      'sourceCommit',
      'easBuildId',
      'nativeFingerprint',
      'deviceMatrix',
    ]) {
      const entry = verifiedApkEntry();
      delete entry[field];
      expect(() => appendApkLedgerEntry(baseLedger(), entry)).toThrow();
    }
  });

  it('검증 완료 APK 기록에는 비 EAS 장기 미러를 유지해요', () => {
    const entry = verifiedApkEntry();
    entry.mirrors = ['https://expo.dev/artifacts/eas/v2.apk'];
    expect(() => appendApkLedgerEntry(baseLedger(), entry)).toThrow();
  });

  it('잘못된 OTA 버전 정보는 원장에 추가하지 않아요', () => {
    const ledger = appendApkLedgerEntry(baseLedger(), verifiedApkEntry());
    expect(() =>
      appendOtaLedgerEntry(ledger, otaEntry({ versionName: '' })),
    ).toThrow();
    expect(() =>
      appendOtaLedgerEntry(ledger, otaEntry({ versionCode: -1 })),
    ).toThrow();
  });

  it('형식만 맞는 다른 기기 증거 해시로 바꾸면 거부해요', () => {
    const entry = verifiedApkEntry();
    entry.deviceMatrix.physicalEvidenceSha256 = 'f'.repeat(64);
    expect(() => appendApkLedgerEntry(baseLedger(), entry)).toThrow();
  });

  it('원장과 매트릭스를 함께 바꿔도 운영 manifest 출처와 대조해요', () => {
    const entry = verifiedApkEntry();
    const ledger = appendApkLedgerEntry(baseLedger(), entry);
    const manifest = {
      packageName: 'com.personal.alarmpyo',
      versionName: '1.0.1',
      versionCode: 2,
      sha256: CANDIDATE_SHA,
      apkUrl: 'https://releases.example.com/alarmpyo/v2/AlarmPyo.apk',
      sourceCommit: 'c'.repeat(40),
      easBuildId: '11111111-1111-4111-8111-111111111111',
      nativeFingerprint: 'd'.repeat(64),
    };
    expect(assertLedgerTracksCurrentRelease(ledger, manifest)).toBe(entry);

    const changed = appendApkLedgerEntry(
      baseLedger(),
      verifiedApkEntry({ sourceCommit: 'f'.repeat(40) }),
    );
    expect(() => assertLedgerTracksCurrentRelease(changed, manifest)).toThrow();
  });
});
