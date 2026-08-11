const { withAndroidManifest } = require('expo/config-plugins');

const REQUEST_INSTALL_PACKAGES = 'android.permission.REQUEST_INSTALL_PACKAGES';
const UPDATE_PROVIDER = 'expo.modules.alarmpyoalarm.AlarmPyoUpdateFileProvider';

function addRemovalMarker(entries, androidName) {
  const current = entries ?? [];
  const alreadyRemoved = current.some(
    (entry) =>
      entry.$?.['android:name'] === androidName &&
      entry.$?.['tools:node'] === 'remove',
  );
  if (!alreadyRemoved) {
    current.push({
      $: {
        'android:name': androidName,
        'tools:node': 'remove',
      },
    });
  }
  return current;
}

/**
 * Play 빌드의 최종 병합 매니페스트에서 직접 APK 설치 구성을 제거해요.
 * blockedPermissions와 함께 명시적 제거 표시를 남겨 하위 모듈이 다시
 * 권한이나 Provider를 추가해도 병합에서 제거되도록 해요.
 */
module.exports = function withPlayStorePolicy(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults.manifest;
    manifest.$ = {
      ...manifest.$,
      'xmlns:tools': manifest.$?.['xmlns:tools'] ?? 'http://schemas.android.com/tools',
    };

    manifest['uses-permission'] = addRemovalMarker(
      manifest['uses-permission'],
      REQUEST_INSTALL_PACKAGES,
    );

    const application = manifest.application?.[0];
    if (application) {
      application.provider = addRemovalMarker(
        application.provider,
        UPDATE_PROVIDER,
      );
    }
    return configWithManifest;
  });
};
