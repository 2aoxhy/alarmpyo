const appJsonConfig = require('./app.json').expo;

const PLAY_DISTRIBUTION = 'play';
const DIRECT_DISTRIBUTION = 'direct';
const REQUEST_INSTALL_PACKAGES = 'android.permission.REQUEST_INSTALL_PACKAGES';

function unique(values) {
  return [...new Set(values)];
}

/**
 * Google Play 빌드와 직접 배포 빌드의 정책을 분리해요.
 *
 * - 기본값(direct): 직접 APK 업데이트 기능을 포함해요. 배포 주소는 새 프로젝트 연결 뒤 별도로 설정해요.
 * - ALARMPYO_DISTRIBUTION=play: APK 설치 권한과 직접 배포 메타데이터를 제거해요.
 */
module.exports = ({ config: suppliedConfig = appJsonConfig } = {}) => {
  // Expo가 app.json을 먼저 해석해 전달한 값을 그대로 기반으로 삼아요.
  // 테스트처럼 인수 없이 호출될 때만 정적 설정을 직접 불러와요.
  const staticConfig = suppliedConfig;
  const distribution =
    process.env.ALARMPYO_DISTRIBUTION === PLAY_DISTRIBUTION
      ? PLAY_DISTRIBUTION
      : DIRECT_DISTRIBUTION;
  const blockedPermissions = (
    staticConfig.android?.blockedPermissions ?? []
  ).filter((permission) => permission !== REQUEST_INSTALL_PACKAGES);

  if (distribution === PLAY_DISTRIBUTION) {
    blockedPermissions.push(REQUEST_INSTALL_PACKAGES);
  }

  const {
    apkUpdateManifestUrl: _apkUpdateManifestUrl,
    apkUpdateManifestUrls: _apkUpdateManifestUrls,
    ...playSafeExtra
  } = staticConfig.extra ?? {};

  return {
    ...staticConfig,
    plugins:
      distribution === PLAY_DISTRIBUTION
        ? [...(staticConfig.plugins ?? []), './plugins/with-play-store-policy.js']
        : staticConfig.plugins,
    android: {
      ...staticConfig.android,
      blockedPermissions: unique(blockedPermissions),
    },
    extra: {
      ...(distribution === PLAY_DISTRIBUTION
        ? playSafeExtra
        : staticConfig.extra),
      distribution,
    },
  };
};
