import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const PLAY_DISTRIBUTION = 'play';
// 2026-08-31부터 신규 앱과 업데이트에 필요한 Android 16 기준이에요.
export const MIN_PLAY_TARGET_SDK = 36;
export const REQUEST_INSTALL_PACKAGES =
  'android.permission.REQUEST_INSTALL_PACKAGES';
export const DIRECT_UPDATE_PROVIDER =
  'expo.modules.alarmpyoalarm.AlarmPyoUpdateFileProvider';
export const DIRECT_UPDATE_BUNDLE_SENTINEL = 'ALARMPYO_DIRECT_APK_UPDATE_V1';
export const PLAY_UPDATE_BUNDLE_SENTINEL = 'ALARMPYO_PLAY_STORE_UPDATE_V1';
export const PLAY_PAGE_ALIGNMENT = 'PAGE_ALIGNMENT_16K';
export const PLAY_PRIVACY_POLICY_BLOCKER = 'privacyPolicyUrl';
export const PLAY_APP_SIGNING_BLOCKER = 'appSigningCertificateSha256';
export const PLAY_APP_SIGNING_STRATEGY_DIRECT_COMPATIBLE =
  'direct-compatible';
export const PLAY_APP_SIGNING_STRATEGY_SEPARATE =
  'google-play-managed-separate';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const PLAY_RELEASE_BLOCKERS = Object.freeze([
  PLAY_PRIVACY_POLICY_BLOCKER,
  PLAY_APP_SIGNING_BLOCKER,
]);
const PLAY_RELEASE_BLOCKER_LABELS = Object.freeze({
  [PLAY_PRIVACY_POLICY_BLOCKER]: '공개 개인정보처리방침 URL',
  [PLAY_APP_SIGNING_BLOCKER]: 'Play App Signing 인증서 SHA-256',
});

export const FORBIDDEN_PLAY_DEX_STRINGS = Object.freeze([
  'expo/modules/alarmpyoalarm/AlarmPyoApkInstaller',
  'expo/modules/alarmpyoalarm/AlarmPyoUpdateFileProvider',
  'expo/modules/alarmpyoalarm/AlarmPyoApkInstallIntentPolicy',
  'verifyAndOpenApkInstallerAsync',
  'openApkInstallPermissionSettingsAsync',
  'verifyApkUpdateAsync',
  'getAppInstallInfoAsync',
  'android.intent.action.INSTALL_PACKAGE',
  'application/vnd.android.package-archive',
  '.alarmpyo-updates',
]);

function decodeXmlEntities(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(
    new RegExp(`(?:android:)?${escaped}\\s*=\\s*["']([^"']+)["']`, 'iu'),
  );
  return match ? decodeXmlEntities(match[1]) : null;
}

function openingTag(xml, name) {
  return xml.match(new RegExp(`<${name}\\b[^>]*>`, 'iu'))?.[0] ?? '';
}

function allAndroidNames(xml, elementName) {
  const values = [];
  const pattern = new RegExp(`<${elementName}\\b[^>]*>`, 'giu');
  for (const match of xml.matchAll(pattern)) {
    const value = attribute(match[0], 'name');
    if (value) values.push(value);
  }
  return values;
}

export function parsePlayManifest(xml) {
  const manifest = openingTag(xml, 'manifest');
  const usesSdk = openingTag(xml, 'uses-sdk');
  const versionCode = Number(attribute(manifest, 'versionCode'));
  const targetSdk = Number(attribute(usesSdk, 'targetSdkVersion'));
  return {
    packageName: attribute(manifest, 'package'),
    versionName: attribute(manifest, 'versionName'),
    versionCode: Number.isSafeInteger(versionCode) ? versionCode : null,
    targetSdk: Number.isSafeInteger(targetSdk) ? targetSdk : null,
    permissions: allAndroidNames(xml, 'uses-permission'),
    providers: allAndroidNames(xml, 'provider'),
    authorities: [...xml.matchAll(/android:authorities\s*=\s*["']([^"']+)["']/giu)]
      .map((match) => decodeXmlEntities(match[1])),
  };
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

export function isHttpsPrivacyPolicyUrl(value) {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.length > 0 &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      !value.includes('?') &&
      !value.includes('#')
    );
  } catch {
    return false;
  }
}

export function validatePlayReleasePolicy(
  policy,
  directPolicy,
  { allowBlocked = false } = {},
) {
  const blockers = policy?.releaseBlockers;
  const privacyPolicyUrl = policy?.privacyPolicyUrl;
  const privacyPolicyBlocked = blockers?.includes(
    PLAY_PRIVACY_POLICY_BLOCKER,
  );
  const signer = policy?.appSigningCertificateSha256;
  const signingStrategy = policy?.appSigningStrategy;
  const directSigners = (directPolicy?.signingCertificateSha256 ?? []).map(
    (value) => value.toLowerCase(),
  );

  ensure(
      policy?.schemaVersion === 2 &&
      policy?.lineage === 'alarmpyo' &&
      !Object.hasOwn(policy, 'productionHostingUrl') &&
      policy?.packageName === directPolicy?.packageName &&
      JSON.stringify(policy?.initialRelease) ===
        JSON.stringify(directPolicy?.initialRelease) &&
      ['active', 'blocked'].includes(policy?.releaseState) &&
      Array.isArray(blockers) &&
      new Set(blockers).size === blockers.length &&
      blockers.every((value) => PLAY_RELEASE_BLOCKERS.includes(value)) &&
      (privacyPolicyUrl === null ||
        isHttpsPrivacyPolicyUrl(privacyPolicyUrl)) &&
      privacyPolicyBlocked === (privacyPolicyUrl === null) &&
      [
        null,
        PLAY_APP_SIGNING_STRATEGY_DIRECT_COMPATIBLE,
        PLAY_APP_SIGNING_STRATEGY_SEPARATE,
      ].includes(signingStrategy) &&
      (signer === null ||
        (typeof signer === 'string' && SHA256_PATTERN.test(signer))) &&
      (signingStrategy !== null || signer === null) &&
      (signingStrategy !== PLAY_APP_SIGNING_STRATEGY_DIRECT_COMPATIBLE ||
        (signer !== null &&
          directSigners.includes(signer.toLowerCase()))) &&
      (signingStrategy !== PLAY_APP_SIGNING_STRATEGY_SEPARATE ||
        signer === null ||
        !directSigners.includes(signer.toLowerCase())) &&
      blockers.includes(PLAY_APP_SIGNING_BLOCKER) === (signer === null) &&
      (policy.releaseState === 'blocked') === (blockers.length > 0),
    'Play AAB 배포 정책 파일이 올바르지 않아요.',
  );

  const normalized = {
    ...policy,
    appSigningCertificateSha256:
      signer === null ? null : signer.toLowerCase(),
    directUpgradeCompatible:
      signer === null
        ? null
        : signingStrategy === PLAY_APP_SIGNING_STRATEGY_DIRECT_COMPATIBLE,
  };
  if (!allowBlocked && normalized.releaseState === 'blocked') {
    const labels = blockers.map(
      (value) => PLAY_RELEASE_BLOCKER_LABELS[value] ?? value,
    );
    throw new Error(
      `Play 릴리스 계보가 아직 차단되어 있어요: ${labels.join(', ')}`,
    );
  }
  return normalized;
}

export async function readPlayReleasePolicy(
  projectRoot,
  directPolicy,
  options = {},
) {
  const policy = JSON.parse(
    await readFile(resolve(projectRoot, 'play-release-policy.json'), 'utf8'),
  );
  return validatePlayReleasePolicy(policy, directPolicy, options);
}

/** bundletool dump config 결과가 Play 생성 APK에 16KB ZIP 정렬을 요청하는지 확인해요. */
export function assertBundlePageAlignment16K(configDump) {
  ensure(
    typeof configDump === 'string' && configDump.trim().length > 0,
    'AAB bundle config를 읽지 못했어요.',
  );
  const alignments = [
    ...new Set(configDump.match(/\bPAGE_ALIGNMENT_[A-Z0-9_]+\b/gu) ?? []),
  ];
  ensure(
    alignments.length === 1 && alignments[0] === PLAY_PAGE_ALIGNMENT,
    alignments.length === 0
      ? 'AAB bundle config에 native library page alignment가 없어요.'
      : `AAB가 16KB page alignment를 요청하지 않아요. 현재 ${alignments.join(', ')}`,
  );
  return PLAY_PAGE_ALIGNMENT;
}

export function validatePlayManifest(xml, expected) {
  const manifest = parsePlayManifest(xml);
  ensure(
    manifest.packageName === expected.packageName,
    `AAB 패키지가 설정과 달라요. AAB ${manifest.packageName ?? '-'} / 설정 ${expected.packageName}`,
  );
  ensure(
    manifest.versionCode === expected.versionCode,
    `AAB versionCode가 설정과 달라요. AAB ${manifest.versionCode ?? '-'} / 설정 ${expected.versionCode}`,
  );
  ensure(
    manifest.versionName === expected.versionName,
    `AAB 버전이 설정과 달라요. AAB ${manifest.versionName ?? '-'} / 설정 ${expected.versionName}`,
  );
  ensure(
    manifest.targetSdk !== null && manifest.targetSdk >= MIN_PLAY_TARGET_SDK,
    `AAB targetSdk는 ${MIN_PLAY_TARGET_SDK} 이상이어야 해요. 현재 ${manifest.targetSdk ?? '-'}이에요.`,
  );
  if (expected.targetSdk !== undefined) {
    ensure(
      manifest.targetSdk === expected.targetSdk,
      `AAB targetSdk가 Play 배포 정책과 달라요. AAB ${manifest.targetSdk ?? '-'} / 정책 ${expected.targetSdk}`,
    );
  }
  ensure(
    !manifest.permissions.includes(REQUEST_INSTALL_PACKAGES),
    'Play AAB에 알 수 없는 출처의 APK 설치 권한이 포함됐어요.',
  );
  ensure(
    !manifest.providers.includes(DIRECT_UPDATE_PROVIDER),
    'Play AAB에 직접 APK 설치용 FileProvider가 포함됐어요.',
  );
  ensure(
    !manifest.authorities.some((value) => value.includes('.alarmpyo-updates')),
    'Play AAB에 직접 APK 공유 authority가 포함됐어요.',
  );
  return manifest;
}

export function assertNoForbiddenDexStrings(entries) {
  for (const entry of entries) {
    for (const forbidden of FORBIDDEN_PLAY_DEX_STRINGS) {
      if (entry.contents.includes(Buffer.from(forbidden, 'utf8'))) {
        throw new Error(
          `Play AAB 네이티브 코드에 직접 APK 설치 구성이 남아 있어요: ${forbidden}`,
        );
      }
    }
  }
}

export function assertPlayJavascriptBundle(entries) {
  const direct = Buffer.from(DIRECT_UPDATE_BUNDLE_SENTINEL, 'utf8');
  const play = Buffer.from(PLAY_UPDATE_BUNDLE_SENTINEL, 'utf8');
  let hasPlaySurface = false;
  for (const entry of entries) {
    if (entry.contents.includes(direct)) {
      throw new Error(
        'Play AAB JavaScript 번들에 직접 APK 업데이트 화면이 포함됐어요.',
      );
    }
    if (entry.contents.includes(play)) hasPlaySurface = true;
  }
  ensure(
    hasPlaySurface,
    'Play AAB JavaScript 번들에서 Google Play 업데이트 화면을 확인하지 못했어요.',
  );
}

export function validateProvenanceBinding(provenance, artifact) {
  ensure(provenance?.schemaVersion === 1, 'AAB 출처 기록 형식이 올바르지 않아요.');
  ensure(provenance?.artifactType === 'android-app-bundle', 'AAB 출처 기록이 아니에요.');
  for (const key of [
    'sha256',
    'sizeBytes',
    'packageName',
    'versionName',
    'versionCode',
    'targetSdk',
    'pageAlignment',
    'releasePurpose',
    'submissionEligible',
  ]) {
    ensure(
      provenance?.[key] === artifact[key],
      `AAB 출처 기록의 ${key} 값이 파일 검증 결과와 달라요.`,
    );
  }
  ensure(
    typeof provenance.sourceCommit === 'string' && /^[0-9a-f]{40}$/u.test(provenance.sourceCommit),
    'AAB 출처 기록에 유효한 소스 커밋이 없어요.',
  );
  ensure(provenance.sourceDirty === false, '변경 중인 소스의 AAB는 제출할 수 없어요.');
  return true;
}
