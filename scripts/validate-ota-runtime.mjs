import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createAndroidNativeFingerprint } from './release-artifact-provenance.mjs';
import {
  isSupportedAppVersion,
  isSupportedPackageVersion,
  packageVersionMatchesApp,
} from './app-version.mjs';

const root = resolve(import.meta.dirname, '..');
const otaMode = process.argv.includes('--ota');
const readJson = async (path) =>
  JSON.parse((await readFile(resolve(root, path), 'utf8')).replace(/^\uFEFF/u, ''));

const [pkg, lock, app, eas, publicManifest, currentNativeFingerprint] =
  await Promise.all([
    readJson('package.json'),
    readJson('package-lock.json'),
    readJson('app.json'),
    readJson('eas.json'),
    otaMode
      ? readJson('public/updates/latest-android.json').catch(() => null)
      : Promise.resolve(null),
    otaMode ? createAndroidNativeFingerprint(root) : Promise.resolve(null),
  ]);

const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};
const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const expo = app.expo ?? {};
const stable = eas.build?.stable ?? {};
const canary = eas.build?.canary ?? {};
const packageLockVersion = lock.packages?.['']?.version;

expect(isSupportedPackageVersion(pkg.version), 'npm 버전은 1.2.3 형식이어야 해요.');
expect(isSupportedAppVersion(expo.version), '앱 표시 버전 형식이 올바르지 않아요.');
expect(
  packageVersionMatchesApp(pkg.version, expo.version) &&
    pkg.version === lock.version &&
    pkg.version === packageLockVersion,
  'npm 버전과 앱 표시 버전의 릴리스 계보가 일치해야 해요.',
);
expect(
  Number.isInteger(expo.android?.versionCode) && expo.android.versionCode > 0,
  'Android versionCode는 1 이상의 정수여야 해요.',
);
expect(
  /^[1-9]\d*$/u.test(expo.ios?.buildNumber ?? ''),
  'iOS buildNumber는 1 이상의 숫자 문자열이어야 해요.',
);
expect(
  eas.cli?.appVersionSource === 'local',
  '앱 버전은 저장소의 app.json을 기준으로 관리해야 해요.',
);
expect(
  expo.runtimeVersion?.policy === 'appVersion',
  '서로 다른 앱 버전에 OTA가 적용되지 않도록 appVersion 런타임 정책이 필요해요.',
);
expect(
  expo.updates?.checkAutomatically === 'ON_LOAD',
  '앱 실행 때 무선 업데이트를 확인하도록 설정해야 해요.',
);
expect(
  Number.isInteger(expo.updates?.fallbackToCacheTimeout) &&
    expo.updates.fallbackToCacheTimeout >= 0,
  '업데이트 캐시 대기 시간은 0 이상의 정수여야 해요.',
);
expect(isHttpsUrl(expo.updates?.url), 'Expo 업데이트 주소는 HTTPS여야 해요.');
expect(
  stable.channel === 'stable' && stable.environment === 'production',
  'stable 빌드는 stable 채널과 production 환경을 사용해야 해요.',
);
expect(
  stable.android?.buildType === 'apk',
  'stable Android 빌드는 APK 형식이어야 해요.',
);
expect(
  canary.channel === 'canary' && canary.environment === 'preview',
  'canary 빌드는 canary 채널과 preview 환경을 사용해야 해요.',
);
expect(
  stable.channel !== canary.channel,
  'stable 채널과 canary 채널은 분리해야 해요.',
);

if (otaMode) {
  const stableUpdate = pkg.scripts?.['publish:update'] ?? '';
  const canaryUpdate = pkg.scripts?.['publish:update:canary'] ?? '';
  expect(
    stableUpdate.includes('release:preflight:update') &&
      /--platform\s+android(?:\s|$)/u.test(stableUpdate) &&
      /--channel\s+stable(?:\s|$)/u.test(stableUpdate) &&
      /--environment\s+production(?:\s|$)/u.test(stableUpdate),
    'stable OTA는 사전 검사 뒤 Android·stable 채널·production 환경에 게시해야 해요.',
  );
  expect(
    canaryUpdate.includes('release:preflight:update') &&
      /--platform\s+android(?:\s|$)/u.test(canaryUpdate) &&
      /--channel\s+canary(?:\s|$)/u.test(canaryUpdate) &&
      /--environment\s+preview(?:\s|$)/u.test(canaryUpdate),
    'canary OTA는 사전 검사 뒤 Android·canary 채널·preview 환경에 게시해야 해요.',
  );
  expect(
    publicManifest?.packageName === expo.android?.package &&
      publicManifest?.versionName === expo.version &&
      publicManifest?.versionCode === expo.android?.versionCode,
    '같은 런타임의 검증된 APK를 먼저 공개한 뒤 OTA를 게시해 주세요.',
  );
  expect(
    /^[0-9a-f]{64}$/iu.test(publicManifest?.nativeFingerprint ?? '') &&
      publicManifest?.nativeFingerprint === currentNativeFingerprint,
    'Android 네이티브 구성이 공개 APK와 달라요. 앱 버전을 올려 새 APK를 먼저 배포해 주세요.',
  );
  expect(
    /^[0-9a-f]{40}$/iu.test(publicManifest?.sourceCommit ?? '') &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        publicManifest?.easBuildId ?? '',
      ) &&
      publicManifest?.provenanceArtifactSha256 === publicManifest?.sha256,
    '공개 APK의 EAS 빌드 출처가 완전하지 않아 OTA를 게시할 수 없어요.',
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(`오류: ${error}`);
  process.exit(1);
}

console.log(
  otaMode
    ? 'OTA 채널과 Android 네이티브 호환 지문을 확인했어요.'
    : '앱 버전과 Android 네이티브 런타임 설정을 확인했어요.',
);
