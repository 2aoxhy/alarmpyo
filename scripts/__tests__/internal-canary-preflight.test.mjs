import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertInternalCanaryConfig,
  validateInternalCanary,
} from '../validate-internal-canary.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const source = (path) => readFileSync(resolve(root, path), 'utf8');

function fixture() {
  const app = readJson('app.json');
  const previousDistribution = process.env.ALARMPYO_DISTRIBUTION;
  process.env.ALARMPYO_DISTRIBUTION = 'direct';
  try {
    const require = createRequire(import.meta.url);
    const createConfig = require(resolve(root, 'app.config.js'));
    return {
      pkg: readJson('package.json'),
      lock: readJson('package-lock.json'),
      app,
      eas: readJson('eas.json'),
      releasePolicy: readJson('release-policy.json'),
      resolvedConfig: createConfig(),
    };
  } finally {
    if (previousDistribution === undefined) {
      delete process.env.ALARMPYO_DISTRIBUTION;
    } else {
      process.env.ALARMPYO_DISTRIBUTION = previousDistribution;
    }
  }
}

describe('비공개 내부 canary APK 게이트', () => {
  it('운영 Hosting만 차단된 direct canary 설정을 허용해요', async () => {
    await expect(validateInternalCanary(root)).resolves.toBe(true);
    expect(fixture().releasePolicy).toMatchObject({
      releaseState: 'blocked',
      productionHostingUrl: null,
      signingCertificateSha256: [
        '49a23f9cc1ef3055b0f601720d6262863e27726718cf5ce6caf4f0062acabe6a',
      ],
    });
  });

  it('Updates를 끄지 않았다면 현재 EAS project ID에 안전하게 연결해야 해요', () => {
    const valid = fixture();
    const projectId = valid.app.expo.extra.eas.projectId;
    valid.app.expo.updates = {
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      url: `https://u.expo.dev/${projectId}`,
    };
    valid.resolvedConfig.updates = structuredClone(valid.app.expo.updates);
    expect(() => assertInternalCanaryConfig(valid)).not.toThrow();

    valid.app.expo.updates.url = 'https://u.expo.dev/00000000-0000-4000-8000-000000000000';
    valid.resolvedConfig.updates.url = valid.app.expo.updates.url;
    expect(() => assertInternalCanaryConfig(valid)).toThrow(
      '현재 EAS project ID',
    );
  });

  it('패키지·프로젝트·버전 계보 불일치를 차단해요', () => {
    const invalid = fixture();
    invalid.app.expo.android.package = 'com.example.other';
    invalid.app.expo.extra.eas.projectId =
      '00000000-0000-4000-8000-000000000000';
    invalid.app.expo.version = '1.0.2';
    expect(() => assertInternalCanaryConfig(invalid)).toThrow(
      /Android 패키지[\s\S]*앱 버전|앱 버전[\s\S]*Android 패키지/u,
    );
  });

  it('EAS canary가 base와 direct 빌더 설정을 잃으면 차단해요', () => {
    const invalid = fixture();
    delete invalid.eas.build.canary.extends;
    invalid.eas.build.canary.env.ALARMPYO_DISTRIBUTION = 'play';
    expect(() => assertInternalCanaryConfig(invalid)).toThrow(
      /internal APK[\s\S]*direct 배포 구분/u,
    );
  });

  it('동적 app config가 versionCode나 Updates를 바꾸면 차단해요', () => {
    const invalid = fixture();
    invalid.resolvedConfig.android.versionCode += 1;
    invalid.resolvedConfig.updates = {
      enabled: true,
      url: 'https://u.expo.dev/00000000-0000-4000-8000-000000000000',
    };
    expect(() => assertInternalCanaryConfig(invalid)).toThrow(
      /versionCode[\s\S]*Expo Updates/u,
    );
  });

  it('공개 릴리스 게이트와 분리하되 필수 검사를 모두 유지해요', () => {
    const pkg = readJson('package.json');
    const preflight = source('scripts/run-internal-canary-preflight.mjs');

    expect(pkg.scripts['release:preflight:canary']).toBe(
      'node scripts/run-internal-canary-preflight.mjs',
    );
    expect(pkg.scripts['build:apk:canary']).toBe(
      'npm run release:preflight:canary && node scripts/run-eas-cli.mjs build --platform android --profile canary',
    );
    expect(pkg.scripts['build:apk']).toBe(
      'npm run release:preflight && node scripts/run-eas-cli.mjs build --platform android --profile stable',
    );
    expect(pkg.scripts['build:apk:stable']).toBe('npm run build:apk');
    expect(preflight).toContain('verifyExactToolchain();');

    for (const required of [
      "['run', 'release:source']",
      "['run', 'check']",
      "['run', 'audit:dependencies']",
      "['run', 'audit:tooling']",
      "'run-expo-doctor.mjs'",
      "'validate-internal-canary.mjs'",
      "['run', 'test:android-native']",
      "'project:info'",
    ]) {
      expect(preflight).toContain(required);
    }
    expect(preflight).not.toContain('audit:artifacts');
    expect(preflight).not.toContain('validate-release.mjs');
    expect(preflight).not.toContain("['run', 'release:preflight']");
    expect(preflight).toContain("process.env.ALARMPYO_EAS_NO_VCS === '1'");
    expect(preflight).toContain("process.env.EAS_NO_VCS === '1'");
  });
});
