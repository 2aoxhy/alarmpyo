import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DIRECT_UPDATE_PROVIDER,
  MIN_PLAY_TARGET_SDK,
  REQUEST_INSTALL_PACKAGES,
  readPlayReleasePolicy,
} from './play-release-policy.mjs';
import {
  BUNDLETOOL_SHA256,
  BUNDLETOOL_VERSION,
} from './bundletool-runtime.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

const PLAY_UPDATE_ASYNC_FUNCTIONS = [
  'getPlayUpdateStatusAsync',
  'startPlayUpdateAsync',
  'completePlayUpdateAsync',
];
const FORBIDDEN_PLAY_NATIVE_APK_SYMBOLS = [
  'AlarmPyoApkInstaller',
  'verifyAndOpenApkInstallerAsync',
  'FileProvider',
  'ACTION_INSTALL_PACKAGE',
  'canRequestPackageInstalls',
];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertPlayNativeApiSource(source) {
  const asyncFunctions = [
    ...source.matchAll(/\bAsyncFunction\s*\(\s*"([^"]+)"/gu),
  ].map((match) => match[1]);
  ensure(
    asyncFunctions.length === PLAY_UPDATE_ASYNC_FUNCTIONS.length &&
      PLAY_UPDATE_ASYNC_FUNCTIONS.every((name) => asyncFunctions.includes(name)),
    'Play 네이티브 API는 허용된 업데이트 함수 3개만 등록해야 합니다.',
  );
  ensure(
    FORBIDDEN_PLAY_NATIVE_APK_SYMBOLS.every(
      (symbol) => !source.includes(symbol),
    ),
    'Play 네이티브 API에 직접 APK 설치 코드가 포함되었습니다.',
  );
  return true;
}

export async function validatePlayConfig() {
  const previous = process.env.ALARMPYO_DISTRIBUTION;
  process.env.ALARMPYO_DISTRIBUTION = 'play';
  try {
    const createConfig = require(resolve(root, 'app.config.js'));
    const config = createConfig();
    ensure(config.extra?.distribution === 'play', 'Play 배포 구분이 설정되지 않았어요.');
    ensure(
      config.android?.blockedPermissions?.includes(REQUEST_INSTALL_PACKAGES),
      'Play 빌드에서 APK 설치 권한을 차단하지 않았어요.',
    );
    ensure(
      config.plugins?.includes('./plugins/with-play-store-policy.js'),
      'Play 매니페스트 정책 플러그인이 누락됐어요.',
    );
    ensure(
      config.extra?.apkUpdateManifestUrl === undefined &&
        config.extra?.apkUpdateManifestUrls === undefined,
      'Play 설정에 직접 APK 배포 주소가 남아 있어요.',
    );

    const [eas, releasePolicy, publicPrivacy, inAppPrivacy] = await Promise.all([
      readFile(resolve(root, 'eas.json'), 'utf8').then(JSON.parse),
      readReleasePolicy(root, { allowBlocked: true }),
      readFile(resolve(root, 'public/privacy-policy.html'), 'utf8'),
      readFile(resolve(root, 'src/app/privacy.tsx'), 'utf8'),
    ]);
    const playPolicy = await readPlayReleasePolicy(root, releasePolicy, {
      allowBlocked: true,
    });
    ensure(
      playPolicy.packageName === config.android.package &&
        playPolicy.packageName === releasePolicy.packageName &&
        Number.isInteger(playPolicy.targetSdk) &&
        playPolicy.targetSdk >= MIN_PLAY_TARGET_SDK,
      'Play AAB 패키지와 targetSdk 정책이 올바르지 않아요.',
    );
    ensure(
      config.updates?.enabled === true &&
        /^https:\/\/u\.expo\.dev\/[0-9a-f-]+$/u.test(
          config.updates?.url ?? '',
        ),
      'Play 개인정보 검증의 기준인 EAS Update 구성을 확인하지 못했어요.',
    );
    for (const [label, contents] of [
      ['공개', publicPrivacy],
      ['앱 내', inAppPrivacy],
    ]) {
      ensure(
        contents.includes('EAS Update') &&
          contents.includes('무작위 설치 토큰') &&
          contents.includes('내부 안전 백업') &&
          contents.includes('진단·치료·치유·예방') &&
          !contents.includes('별도 업데이트 서버에 접속하지 않아요'),
        `${label} 개인정보 처리방침이 Play 네트워크·초기화·수면 기능과 일치하지 않아요.`,
      );
    }
    ensure(
      publicPrivacy.includes('<meta name="color-scheme" content="dark"') &&
        publicPrivacy.includes('color-scheme: dark') &&
        !publicPrivacy.includes('prefers-color-scheme') &&
        !publicPrivacy.includes('light dark'),
      '공개 개인정보 처리방침이 다크 전용 정책과 달라요.',
    );
    ensure(
      playPolicy.bundletool?.version === BUNDLETOOL_VERSION &&
        playPolicy.bundletool?.sha256 === BUNDLETOOL_SHA256,
      'Play AAB bundletool 버전과 SHA-256 고정값이 달라요.',
    );
    ensure(
      eas.build?.production?.distribution === 'store' &&
        eas.build?.production?.android?.buildType === 'app-bundle' &&
        eas.build?.production?.env?.ALARMPYO_DISTRIBUTION === 'play',
      'EAS production 프로필이 Play AAB 전용으로 고정되지 않았어요.',
    );
    ensure(
      eas.build?.['play-signing-bootstrap']?.environment === 'preview' &&
        eas.build?.['play-signing-bootstrap']?.distribution === 'store' &&
        eas.build?.['play-signing-bootstrap']?.android?.buildType ===
          'app-bundle' &&
        eas.build?.['play-signing-bootstrap']?.env
          ?.ALARMPYO_DISTRIBUTION === 'play',
      'EAS Play 서명 부트스트랩 프로필이 preview AAB 전용으로 고정되지 않았어요.',
    );
    ensure(
      eas.submit?.internal?.android?.track === 'internal' &&
        eas.submit?.internal?.android?.releaseStatus === 'draft',
      'Play 초안 제출이 내부 테스트 트랙으로 고정되지 않았어요.',
    );
    ensure(
      eas.submit?.alpha?.android?.track === 'alpha' &&
        eas.submit?.alpha?.android?.releaseStatus === 'completed',
      'Play Alpha 제출이 활성 비공개 테스트 트랙으로 고정되지 않았어요.',
    );

    const gradle = await readFile(
      resolve(root, 'modules/alarmpyo-alarm/android/build.gradle'),
      'utf8',
    );
    const playStub = await readFile(
      resolve(
        root,
        'modules/alarmpyo-alarm/android/src/play/java/expo/modules/alarmpyoalarm/AlarmPyoDistributionApi.kt',
      ),
      'utf8',
    );
    const playPlugin = await readFile(
      resolve(root, 'plugins/with-play-store-policy.js'),
      'utf8',
    );
    ensure(
      gradle.includes("System.getenv('ALARMPYO_DISTRIBUTION') == 'play'") &&
        gradle.includes('src/${alarmpyoDistribution}/java'),
      'Android 모듈이 Play/direct 소스 세트를 빌드 시점에 분리하지 않았어요.',
    );
    assertPlayNativeApiSource(playStub);
    ensure(
      playPlugin.includes(REQUEST_INSTALL_PACKAGES) &&
        playPlugin.includes(DIRECT_UPDATE_PROVIDER),
      'Play 매니페스트 정책이 권한과 Provider를 모두 제거하지 않았어요.',
    );
    return true;
  } finally {
    if (previous === undefined) delete process.env.ALARMPYO_DISTRIBUTION;
    else process.env.ALARMPYO_DISTRIBUTION = previous;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  validatePlayConfig()
    .then(() => console.log('Google Play 빌드 정책 설정을 확인했어요.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
