import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DIRECT_UPDATE_PROVIDER,
  REQUEST_INSTALL_PACKAGES,
} from './play-release-policy.mjs';
import {
  BUNDLETOOL_SHA256,
  BUNDLETOOL_VERSION,
} from './bundletool-runtime.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

function ensure(condition, message) {
  if (!condition) throw new Error(message);
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

    const [eas, playPolicy, releasePolicy] = await Promise.all([
      readFile(resolve(root, 'eas.json'), 'utf8').then(JSON.parse),
      readFile(resolve(root, 'play-release-policy.json'), 'utf8').then(
        JSON.parse,
      ),
      readReleasePolicy(root, { allowBlocked: true }),
    ]);
    ensure(
      playPolicy.schemaVersion === 2 &&
        playPolicy.lineage === 'alarmpyo' &&
        playPolicy.packageName === config.android.package &&
        playPolicy.packageName === releasePolicy.packageName &&
        JSON.stringify(playPolicy.initialRelease) ===
          JSON.stringify(releasePolicy.initialRelease) &&
        playPolicy.releaseState === releasePolicy.releaseState &&
        JSON.stringify(playPolicy.releaseBlockers) ===
          JSON.stringify(releasePolicy.releaseBlockers) &&
        Number.isInteger(playPolicy.targetSdk) &&
        playPolicy.targetSdk >= 35,
      'Play AAB 패키지와 targetSdk 정책이 올바르지 않아요.',
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
      eas.submit?.internal?.android?.track === 'internal' &&
        eas.submit?.internal?.android?.releaseStatus === 'draft',
      'Play 초안 제출이 내부 테스트 트랙으로 고정되지 않았어요.',
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
    ensure(
      !playStub.includes('AlarmPyoApkInstaller') &&
        !playStub.includes('AsyncFunction') &&
        !playStub.includes('FileProvider') &&
        !playStub.includes('ACTION_INSTALL_PACKAGE') &&
        !playStub.includes('canRequestPackageInstalls'),
      'Play 네이티브 빈 구현에 직접 APK 설치 코드가 포함됐어요.',
    );
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
