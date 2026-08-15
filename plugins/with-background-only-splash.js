const fs = require('node:fs');
const path = require('node:path');

const {
  AndroidConfig,
  withAndroidStyles,
  withDangerousMod,
} = require('expo/config-plugins');

const DRAWABLE_NAME = 'alarmpyo_splash_transparent';
const SPLASH_STYLE = 'Theme.App.SplashScreen';

function setBackgroundOnlySplashIcon(styles) {
  return AndroidConfig.Styles.assignStylesValue(styles, {
    add: true,
    name: 'windowSplashScreenAnimatedIcon',
    parent: { name: SPLASH_STYLE },
    value: `@drawable/${DRAWABLE_NAME}`,
  });
}

/**
 * expo-splash-screen always references an Android 12 animated-icon drawable,
 * even when no image is configured. Point that slot at a transparent drawable
 * so the native handoff is visibly background-only and React owns the brand fade.
 */
function withBackgroundOnlySplash(config) {
  config = withAndroidStyles(config, (androidConfig) => {
    androidConfig.modResults = setBackgroundOnlySplashIcon(
      androidConfig.modResults,
    );
    return androidConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      const drawablePath = path.join(
        androidConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable',
        `${DRAWABLE_NAME}.xml`,
      );
      await fs.promises.mkdir(path.dirname(drawablePath), { recursive: true });
      await fs.promises.writeFile(
        drawablePath,
        [
          '<?xml version="1.0" encoding="utf-8"?>',
          '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">',
          '  <solid android:color="@android:color/transparent" />',
          '</shape>',
          '',
        ].join('\n'),
        'utf8',
      );
      return androidConfig;
    },
  ]);
}

module.exports = withBackgroundOnlySplash;
module.exports.setBackgroundOnlySplashIcon = setBackgroundOnlySplashIcon;
