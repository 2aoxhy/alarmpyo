import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RELEASE_BLOCKER_LABELS = Object.freeze({
  expoProjectId: 'Expo project ID',
  productionHostingUrl: 'production Hosting URL',
  signingCertificateSha256: '앱 서명 인증서 SHA-256',
});

function isHttpsBaseUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function isReleasePolicyShape(policy) {
  const isBlocked = policy?.releaseState === 'blocked';
  const certificates = policy?.signingCertificateSha256;
  return (
    policy?.schemaVersion === 2 &&
    policy?.lineage === 'alarmpyo' &&
    policy?.packageName === 'com.personal.alarmpyo' &&
    policy?.initialRelease?.versionName === '1.0.0' &&
    policy?.initialRelease?.androidVersionCode === 1 &&
    policy?.initialRelease?.iosBuildNumber === '1' &&
    ['active', 'blocked'].includes(policy?.releaseState) &&
    Array.isArray(policy?.releaseBlockers) &&
    new Set(policy.releaseBlockers).size === policy.releaseBlockers.length &&
    policy.releaseBlockers.every((value) =>
      Object.hasOwn(RELEASE_BLOCKER_LABELS, value),
    ) &&
    (policy?.expoProjectId === null ||
      UUID_PATTERN.test(policy?.expoProjectId ?? '')) &&
    (policy?.productionHostingUrl === null ||
      isHttpsBaseUrl(policy?.productionHostingUrl)) &&
    Array.isArray(certificates) &&
    certificates.every(
      (value) => typeof value === 'string' && SHA256_PATTERN.test(value),
    ) &&
    (isBlocked ||
      (policy.releaseBlockers.length === 0 &&
        UUID_PATTERN.test(policy.expoProjectId ?? '') &&
        isHttpsBaseUrl(policy.productionHostingUrl) &&
        certificates.length > 0)) &&
    (!isBlocked || policy.releaseBlockers.length > 0) &&
    Number.isInteger(policy?.keepPublicApkVersions) &&
    policy.keepPublicApkVersions >= 3 &&
    policy.keepPublicApkVersions <= 20
  );
}

export function assertReleasePolicyReady(policy) {
  if (policy.releaseState === 'active') return policy;
  const labels = policy.releaseBlockers.map(
    (value) => RELEASE_BLOCKER_LABELS[value] ?? value,
  );
  throw new Error(
    `AlarmPyo 릴리스 계보가 아직 차단되어 있어요: ${labels.join(', ')}`,
  );
}

export async function hashFileSha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function readReleasePolicy(
  projectRoot,
  { allowBlocked = false } = {},
) {
  const policy = JSON.parse(
    await readFile(resolve(projectRoot, 'release-policy.json'), 'utf8'),
  );
  if (!isReleasePolicyShape(policy)) {
    throw new Error('APK 운영 배포 정책 파일이 올바르지 않아요.');
  }
  const normalized = {
    ...policy,
    signingCertificateSha256: policy.signingCertificateSha256.map((value) =>
      value.toLowerCase(),
    ),
  };
  if (!allowBlocked) assertReleasePolicyReady(normalized);
  return normalized;
}

export function assertReleaseVersionIsNewer(nextVersionCode, currentManifest) {
  const currentVersionCode = currentManifest?.versionCode;
  if (!Number.isInteger(nextVersionCode) || nextVersionCode < 1) {
    throw new Error('새 APK 버전 코드를 확인할 수 없어요.');
  }
  if (
    Number.isInteger(currentVersionCode) &&
    nextVersionCode <= currentVersionCode
  ) {
    throw new Error(
      `새 APK 버전 코드(${nextVersionCode})는 현재 공개 버전 코드(${currentVersionCode})보다 커야 해요.`,
    );
  }
}

export function assertTrustedSigningCertificates(actual, policy) {
  const trusted = new Set(policy.signingCertificateSha256);
  const normalized = actual.map((value) => value.toLowerCase());
  if (
    normalized.length === 0 ||
    normalized.some((value) => !trusted.has(value))
  ) {
    throw new Error('APK 서명 인증서가 AlarmPyo 운영 인증서와 일치하지 않아요.');
  }
}

export function assertImmutableArtifact(existingSha256, nextSha256) {
  if (
    existingSha256 !== null &&
    existingSha256.toLowerCase() !== nextSha256.toLowerCase()
  ) {
    throw new Error('같은 공개 APK 버전 경로에 다른 파일을 덮어쓸 수 없어요.');
  }
}
