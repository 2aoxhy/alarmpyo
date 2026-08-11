import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { writeJsonAtomic } from './atomic-json-file.mjs';

export const RELEASE_LEDGER_SCHEMA_VERSION = 1;
export const DEFAULT_RELEASE_LEDGER_PATH = 'docs/release-ledger.json';

const SHA256_PATTERN = /^[0-9a-f]{64}$/iu;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/iu;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERIFIED_EMULATOR_SDKS = [31, 33, 34, 35, 36];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value) {
  try {
    return typeof value === 'string' && new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isEphemeralEasArtifact(value) {
  try {
    const url = new URL(value);
    return (
      url.hostname === 'expo.dev' && url.pathname.includes('/artifacts/eas/')
    );
  } catch {
    return false;
  }
}

function isValidTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function createDeviceMatrixBindingSha256(value) {
  const payload = {
    schemaVersion: value?.schemaVersion,
    apkSha256: value?.apkSha256,
    sourceCommit: value?.sourceCommit,
    easBuildId: value?.easBuildId,
    nativeFingerprint: value?.nativeFingerprint,
    checkedAt: value?.checkedAt,
    physicalEvidenceSha256: value?.physicalEvidenceSha256,
    emulatorEvidence: Array.isArray(value?.emulatorEvidence)
      ? value.emulatorEvidence
          .map((entry) => ({ sdk: entry?.sdk, sha256: entry?.sha256 }))
          .toSorted((left, right) => Number(left.sdk) - Number(right.sdk))
      : [],
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function isValidVerifiedDeviceMatrix(value) {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 3 ||
    !SHA256_PATTERN.test(value.apkSha256 ?? '') ||
    !COMMIT_PATTERN.test(value.sourceCommit ?? '') ||
    !UUID_PATTERN.test(value.easBuildId ?? '') ||
    !SHA256_PATTERN.test(value.nativeFingerprint ?? '') ||
    !SHA256_PATTERN.test(value.bindingSha256 ?? '') ||
    !isValidTimestamp(value.checkedAt) ||
    !SHA256_PATTERN.test(value.physicalEvidenceSha256 ?? '') ||
    !Array.isArray(value.emulatorEvidence) ||
    value.emulatorEvidence.length !== VERIFIED_EMULATOR_SDKS.length
  ) {
    return false;
  }
  const evidenceBySdk = new Map();
  for (const evidence of value.emulatorEvidence) {
    if (
      !isRecord(evidence) ||
      !Number.isInteger(evidence.sdk) ||
      !SHA256_PATTERN.test(evidence.sha256 ?? '') ||
      evidenceBySdk.has(evidence.sdk)
    ) {
      return false;
    }
    evidenceBySdk.set(evidence.sdk, evidence.sha256);
  }
  return (
    VERIFIED_EMULATOR_SDKS.every((sdk) => evidenceBySdk.has(sdk)) &&
    createDeviceMatrixBindingSha256(value) === value.bindingSha256.toLowerCase()
  );
}

function isValidApkEntry(entry) {
  if (
    !isRecord(entry) ||
    !Number.isInteger(entry.versionCode) ||
    entry.versionCode < 1 ||
    typeof entry.versionName !== 'string' ||
    entry.versionName.length === 0 ||
    !SHA256_PATTERN.test(entry.sha256 ?? '') ||
    !Number.isSafeInteger(entry.sizeBytes) ||
    entry.sizeBytes < 1 ||
    !isHttpsUrl(entry.primaryUrl) ||
    !Array.isArray(entry.mirrors) ||
    entry.mirrors.length === 0 ||
    new Set(entry.mirrors).size !== entry.mirrors.length ||
    !entry.mirrors.every(isHttpsUrl) ||
    entry.evidenceLevel !== 'verified-v3' ||
    !isValidTimestamp(entry.promotedAt)
  ) {
    return false;
  }
  if (
    entry.sourceCommit !== undefined &&
    !COMMIT_PATTERN.test(entry.sourceCommit)
  ) {
    return false;
  }
  if (entry.easBuildId !== undefined && !UUID_PATTERN.test(entry.easBuildId)) {
    return false;
  }
  if (
    entry.nativeFingerprint !== undefined &&
    !SHA256_PATTERN.test(entry.nativeFingerprint)
  ) {
    return false;
  }
  if (
    entry.deviceMatrix !== undefined &&
    !isValidVerifiedDeviceMatrix(entry.deviceMatrix)
  ) {
    return false;
  }
  return (
    COMMIT_PATTERN.test(entry.sourceCommit ?? '') &&
    UUID_PATTERN.test(entry.easBuildId ?? '') &&
    SHA256_PATTERN.test(entry.nativeFingerprint ?? '') &&
    entry.mirrors.every((url) => url !== entry.primaryUrl) &&
    entry.mirrors.some((url) => !isEphemeralEasArtifact(url)) &&
    isValidVerifiedDeviceMatrix(entry.deviceMatrix) &&
    entry.deviceMatrix.apkSha256.toLowerCase() === entry.sha256.toLowerCase() &&
    entry.deviceMatrix.sourceCommit.toLowerCase() ===
      entry.sourceCommit.toLowerCase() &&
    entry.deviceMatrix.easBuildId.toLowerCase() === entry.easBuildId.toLowerCase() &&
    entry.deviceMatrix.nativeFingerprint.toLowerCase() ===
      entry.nativeFingerprint.toLowerCase()
  );
}

function isValidOtaEntry(entry) {
  return (
    isRecord(entry) &&
    ['stable', 'canary'].includes(entry.channel) &&
    typeof entry.previousBranch === 'string' &&
    entry.previousBranch.length > 0 &&
    typeof entry.candidateBranch === 'string' &&
    entry.candidateBranch.startsWith(`release-candidate-${entry.channel}-`) &&
    typeof entry.versionName === 'string' &&
    entry.versionName.length > 0 &&
    Number.isInteger(entry.versionCode) &&
    entry.versionCode > 0 &&
    COMMIT_PATTERN.test(entry.sourceCommit ?? '') &&
    SHA256_PATTERN.test(entry.baseApkSha256 ?? '') &&
    Array.isArray(entry.groups) &&
    entry.groups.length > 0 &&
    new Set(entry.groups).size === entry.groups.length &&
    entry.groups.every(
      (group) => typeof group === 'string' && group.length > 0,
    ) &&
    isValidTimestamp(entry.promotedAt)
  );
}

function assertLedgerShape(ledger) {
  if (
    !isRecord(ledger) ||
    ledger.schemaVersion !== RELEASE_LEDGER_SCHEMA_VERSION
  ) {
    throw new Error(
      `릴리스 원장은 schemaVersion ${RELEASE_LEDGER_SCHEMA_VERSION}이어야 해요.`,
    );
  }
  if (ledger.packageName !== 'com.personal.alarmpyo') {
    throw new Error('릴리스 원장은 AlarmPyo 패키지만 기록해야 해요.');
  }
  if (
    !Array.isArray(ledger.apkReleases) ||
    !Array.isArray(ledger.otaPromotions)
  ) {
    throw new Error('릴리스 원장의 APK·OTA 기록 목록이 올바르지 않아요.');
  }
  const versionCodes = new Set();
  for (const entry of ledger.apkReleases) {
    if (!isValidApkEntry(entry)) {
      throw new Error('릴리스 원장에 올바르지 않은 APK 기록이 있어요.');
    }
    if (versionCodes.has(entry.versionCode)) {
      throw new Error(
        `릴리스 원장에 versionCode ${entry.versionCode}가 중복돼요.`,
      );
    }
    versionCodes.add(entry.versionCode);
  }
  if (
    !ledger.otaPromotions.every((entry) => {
      if (!isValidOtaEntry(entry)) return false;
      const baseApk = ledger.apkReleases.find(
        (candidate) => candidate.versionCode === entry.versionCode,
      );
      return (
        Boolean(baseApk) &&
        baseApk.versionName === entry.versionName &&
        baseApk.sha256.toLowerCase() === entry.baseApkSha256.toLowerCase()
      );
    })
  ) {
    throw new Error('릴리스 원장에 올바르지 않은 OTA 승격 기록이 있어요.');
  }
  return ledger;
}

export function assertDurableApkMirrors(manifest) {
  if (
    !Array.isArray(manifest?.apkMirrors) ||
    manifest.apkMirrors.length === 0
  ) {
    throw new Error(
      '운영 APK에는 기본 주소와 별도의 HTTPS 미러가 한 개 이상 필요해요.',
    );
  }
  const primary = manifest.apkUrl;
  const mirrors = [...new Set(manifest.apkMirrors)];
  if (
    mirrors.length !== manifest.apkMirrors.length ||
    mirrors.some((url) => !isHttpsUrl(url) || url === primary)
  ) {
    throw new Error('운영 APK 미러는 중복되지 않은 별도 HTTPS 주소여야 해요.');
  }
  if (mirrors.every(isEphemeralEasArtifact)) {
    throw new Error(
      'EAS 임시 산출물 외에 장기 보관 가능한 APK 미러가 필요해요.',
    );
  }
  return mirrors;
}

export async function readReleaseLedger(
  projectRoot,
  path = DEFAULT_RELEASE_LEDGER_PATH,
) {
  const absolutePath = resolve(projectRoot, path);
  const ledger = JSON.parse(
    (await readFile(absolutePath, 'utf8')).replace(/^\uFEFF/u, ''),
  );
  return assertLedgerShape(ledger);
}

export function assertLedgerTracksCurrentRelease(ledger, currentManifest) {
  assertLedgerShape(ledger);
  if (ledger.packageName !== currentManifest?.packageName) {
    throw new Error('현재 운영 APK의 패키지 이름이 릴리스 원장과 달라요.');
  }
  const entry = ledger.apkReleases.find(
    (candidate) => candidate.versionCode === currentManifest?.versionCode,
  );
  if (
    !entry ||
    entry.versionName !== currentManifest.versionName ||
    entry.sha256.toLowerCase() !==
      String(currentManifest.sha256 ?? '').toLowerCase() ||
    entry.primaryUrl !== currentManifest.apkUrl ||
    (currentManifest.sourceCommit !== undefined &&
      entry.sourceCommit !== currentManifest.sourceCommit) ||
    (currentManifest.easBuildId !== undefined &&
      entry.easBuildId !== currentManifest.easBuildId) ||
    (currentManifest.nativeFingerprint !== undefined &&
      entry.nativeFingerprint !== currentManifest.nativeFingerprint)
  ) {
    throw new Error(
      '현재 운영 APK가 지속 가능한 릴리스 원장과 일치하지 않아요.',
    );
  }
  return entry;
}

export function createApkLedgerEntry(manifest, matrixBinding, promotedAt) {
  const mirrors = assertDurableApkMirrors(manifest);
  const deviceMatrix = {
    schemaVersion: 3,
    apkSha256: matrixBinding?.apkSha256,
    sourceCommit: matrixBinding?.sourceCommit,
    easBuildId: matrixBinding?.easBuildId,
    nativeFingerprint: matrixBinding?.nativeFingerprint,
    checkedAt: matrixBinding?.checkedAt,
    physicalEvidenceSha256: matrixBinding?.physicalEvidenceSha256,
    emulatorEvidence: matrixBinding?.emulatorEvidence,
  };
  deviceMatrix.bindingSha256 = createDeviceMatrixBindingSha256(deviceMatrix);
  if (
    !COMMIT_PATTERN.test(manifest.sourceCommit ?? '') ||
    !UUID_PATTERN.test(manifest.easBuildId ?? '') ||
    !SHA256_PATTERN.test(manifest.nativeFingerprint ?? '') ||
    !isValidVerifiedDeviceMatrix(deviceMatrix)
  ) {
    throw new Error(
      '검증된 출처와 기기 매트릭스가 있어야 APK 원장을 추가할 수 있어요.',
    );
  }
  if (
    matrixBinding.apkSha256 !== manifest.sha256 ||
    matrixBinding.sourceCommit !== manifest.sourceCommit ||
    matrixBinding.easBuildId !== manifest.easBuildId ||
    matrixBinding.nativeFingerprint !== manifest.nativeFingerprint
  ) {
    throw new Error('APK 원장과 기기 매트릭스가 같은 산출물을 가리켜야 해요.');
  }
  return {
    versionName: manifest.versionName,
    versionCode: manifest.versionCode,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    primaryUrl: manifest.apkUrl,
    mirrors,
    sourceCommit: manifest.sourceCommit,
    easBuildId: manifest.easBuildId,
    nativeFingerprint: manifest.nativeFingerprint,
    deviceMatrix,
    evidenceLevel: 'verified-v3',
    promotedAt: new Date(promotedAt).toISOString(),
  };
}

export function appendApkLedgerEntry(ledger, entry) {
  assertLedgerShape(ledger);
  if (
    ledger.apkReleases.some((item) => item.versionCode === entry.versionCode)
  ) {
    throw new Error(
      `versionCode ${entry.versionCode}는 릴리스 원장에 이미 있어요.`,
    );
  }
  return assertLedgerShape({
    ...ledger,
    apkReleases: [...ledger.apkReleases, entry].toSorted(
      (left, right) => left.versionCode - right.versionCode,
    ),
  });
}

export function appendOtaLedgerEntry(ledger, entry) {
  assertLedgerShape(ledger);
  if (!isValidOtaEntry(entry)) {
    throw new Error('OTA 승격 원장 기록이 올바르지 않아요.');
  }
  const baseApk = ledger.apkReleases.find(
    (item) => item.versionCode === entry.versionCode,
  );
  if (
    !baseApk ||
    baseApk.versionName !== entry.versionName ||
    baseApk.sha256.toLowerCase() !== entry.baseApkSha256.toLowerCase()
  ) {
    throw new Error('OTA 승격 기록이 같은 버전의 검증된 APK와 일치하지 않아요.');
  }
  if (
    ledger.otaPromotions.some(
      (item) =>
        item.channel === entry.channel &&
        item.candidateBranch === entry.candidateBranch,
    )
  ) {
    throw new Error('같은 OTA 채널 승격 기록이 이미 있어요.');
  }
  return assertLedgerShape({
    ...ledger,
    otaPromotions: [...ledger.otaPromotions, entry],
  });
}

export async function writeReleaseLedger(
  projectRoot,
  ledger,
  path = DEFAULT_RELEASE_LEDGER_PATH,
) {
  assertLedgerShape(ledger);
  await writeJsonAtomic(resolve(projectRoot, path), ledger);
}
