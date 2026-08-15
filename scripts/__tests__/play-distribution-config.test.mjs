import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const createAppConfig = require('../../app.config.js');
const requestInstallPackages = 'android.permission.REQUEST_INSTALL_PACKAGES';
const originalDistribution = process.env.ALARMPYO_DISTRIBUTION;

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8'));
}

afterEach(() => {
  if (originalDistribution === undefined) {
    delete process.env.ALARMPYO_DISTRIBUTION;
  } else {
    process.env.ALARMPYO_DISTRIBUTION = originalDistribution;
  }
});

describe('Google Play 배포 설정', () => {
  it('기본 직접 배포에서는 기존 APK 업데이트 흐름을 유지해요', () => {
    delete process.env.ALARMPYO_DISTRIBUTION;

    const config = createAppConfig();

    expect(config.extra.distribution).toBe('direct');
    expect(config.plugins).not.toContain('./plugins/with-play-store-policy.js');
    expect(config.android.blockedPermissions).not.toContain(
      requestInstallPackages,
    );
  });

  it('Play 빌드에서는 외부 APK 설치 권한을 제거해요', () => {
    process.env.ALARMPYO_DISTRIBUTION = 'play';

    const config = createAppConfig();

    expect(config.extra.distribution).toBe('play');
    expect(config.plugins).toContain('./plugins/with-play-store-policy.js');
    expect(config.android.blockedPermissions).toContain(requestInstallPackages);
    expect(config.extra.apkUpdateManifestUrl).toBeUndefined();
    expect(config.extra.apkUpdateManifestUrls).toBeUndefined();
    expect(
      config.android.blockedPermissions.filter(
        (permission) => permission === requestInstallPackages,
      ),
    ).toHaveLength(1);
  });

  it('Play 프로필은 AAB와 내부 초안·Alpha 활성 제출로 분리해요', () => {
    const eas = readJson('eas.json');

    expect(eas.build.stable).toMatchObject({
      env: { ALARMPYO_DISTRIBUTION: 'direct' },
      android: { buildType: 'apk' },
    });
    expect(eas.build.production).toMatchObject({
      distribution: 'store',
      environment: 'production',
      env: { ALARMPYO_DISTRIBUTION: 'play' },
      android: { buildType: 'app-bundle' },
    });
    expect(eas.build['play-signing-bootstrap']).toMatchObject({
      distribution: 'store',
      environment: 'preview',
      env: { ALARMPYO_DISTRIBUTION: 'play' },
      android: { buildType: 'app-bundle' },
    });
    expect(eas.submit.production.android).toEqual({
      track: 'internal',
      releaseStatus: 'draft',
    });
    expect(eas.submit.internal.android).toEqual({
      track: 'internal',
      releaseStatus: 'draft',
    });
    expect(eas.submit.alpha.android).toEqual({
      track: 'alpha',
      releaseStatus: 'completed',
    });
  });
});
