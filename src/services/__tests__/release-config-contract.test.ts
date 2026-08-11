// Vitest는 Node.js에서 실행되지만 앱의 Expo 전용 tsconfig은 Node 타입을 노출하지 않습니다.
// @ts-expect-error 테스트 런너에서 제공하는 Node.js 표준 모듈입니다.
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error 테스트 런너에서 제공하는 Node.js 표준 모듈입니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8'));
}

describe('stable 배포 설정', () => {
  it('기본 APK 빌드와 무선 업데이트가 stable만 사용합니다', () => {
    const pkg = readJson('package.json');
    expect(pkg.scripts['build:apk']).toContain('--profile stable');
    expect(pkg.scripts['build:apk']).not.toContain('--profile preview');
    expect(pkg.scripts['publish:update']).toContain('--channel stable');
    expect(pkg.scripts['publish:update']).toContain('--environment production');
    expect(pkg.scripts['publish:update']).not.toContain('--channel preview');
  });

  it('네이티브 검사는 업데이트 지문 계산 뒤에 실행합니다', () => {
    const pkg = readJson('package.json');
    expect(pkg.scripts['eas-build-post-install']).toBeUndefined();
    expect(pkg.scripts['eas-build-on-success']).toBe(
      'node scripts/run-native-unit-tests.mjs',
    );
  });

  it('EAS 제출 전에 의존성과 네이티브 검사를 모두 실행합니다', () => {
    const pkg = readJson('package.json');
    expect(pkg.scripts['release:preflight']).toContain('npm run check');
    expect(pkg.scripts['release:preflight']).toContain('npm run audit:dependencies');
    expect(pkg.scripts['release:preflight']).toContain('npm run audit:tooling');
    expect(pkg.scripts['release:preflight:update']).toContain(
      'npm run release:source',
    );
    expect(pkg.scripts['release:preflight:update']).toContain(
      'npm run audit:tooling',
    );
    expect(pkg.scripts['release:preflight']).toContain(
      'node scripts/run-expo-doctor.mjs',
    );
    expect(pkg.scripts['release:preflight']).toContain('npm run test:android-native');
    expect(pkg.scripts['build:apk']).toContain('npm run release:preflight');
    expect(pkg.scripts['release:verify:distribution']).toContain(
      '--verify-apk-content',
    );
  });

  it('시험 빌드는 명시적인 canary 프로필로만 분리합니다', () => {
    const eas = readJson('eas.json');
    expect(eas.build.preview).toBeUndefined();
    expect(eas.build.canary).toMatchObject({
      channel: 'canary',
      environment: 'preview',
    });
    expect(eas.build.stable).toMatchObject({
      channel: 'stable',
      environment: 'production',
    });
  });

  it('내부 canary는 새 Expo 프로젝트를 사용하고 공개 direct 배포 주소는 비워 둡니다', () => {
    const pkg = readJson('package.json');
    const app = readJson('app.json');
    expect(pkg.overrides.uuid).toBe('11.1.1');
    expect(app.expo.updates).toEqual({
      enabled: true,
      url: 'https://u.expo.dev/ffdda16b-a290-4fc6-919b-fddd50e0c25f',
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    });
    expect(app.expo.extra.apkUpdateManifestUrls).toBeUndefined();
    expect(app.expo.extra.apkUpdateManifestUrl).toBeUndefined();
    expect(app.expo.owner).toBe('2aox.hy');
    expect(app.expo.extra.eas).toEqual({
      projectId: 'ffdda16b-a290-4fc6-919b-fddd50e0c25f',
    });
    expect(app.expo.plugins).toContain(
      './plugins/with-async-storage-database-size.js',
    );
    expect(app.expo.runtimeVersion).toEqual({ policy: 'appVersion' });
  });

  it('알람표 표시명과 새 앱 계보 식별자·초기 버전을 유지합니다', () => {
    const pkg = readJson('package.json');
    const app = readJson('app.json');
    const generatedAndroidStringsPath = resolve(
      process.cwd(),
      'android/app/src/main/res/values/strings.xml',
    );
    const appIconPath = resolve(process.cwd(), 'assets/images/alarmpyo-icon.png');
    const adaptiveForegroundPath = resolve(
      process.cwd(),
      'assets/images/alarmpyo-adaptive-foreground.png',
    );
    const adaptiveMonochromePath = resolve(
      process.cwd(),
      'assets/images/alarmpyo-adaptive-monochrome.png',
    );

    expect(app.expo.name).toBe('알람표');
    expect(app.expo.description).toBe(
      '주간·교대 근무표와 기상 알람을 간편하게 관리해요',
    );
    expect(pkg.version).toBe('1.0.0');
    expect(app.expo.version).toBe('1.0.0');
    expect(app.expo.android.versionCode).toBe(1);
    expect(app.expo.ios.buildNumber).toBe('1');
    // `android`는 Expo prebuild가 만드는 생성물이므로 새 clone과 소스
    // 아카이브에는 없을 수 있어요. 생성물이 있을 때에는 그 결과도 함께
    // 검증하고, 없을 때에는 원본 Expo 설정 계약만 검증해요.
    if (existsSync(generatedAndroidStringsPath)) {
      expect(readFileSync(generatedAndroidStringsPath, 'utf8')).toContain(
        '<string name="app_name">알람표</string>',
      );
    }
    expect(app.expo.icon).toBe('./assets/images/alarmpyo-icon.png');
    expect(app.expo.android.adaptiveIcon).toMatchObject({
      foregroundImage: './assets/images/alarmpyo-adaptive-foreground.png',
      monochromeImage: './assets/images/alarmpyo-adaptive-monochrome.png',
    });
    expect(existsSync(appIconPath)).toBe(true);
    expect(existsSync(adaptiveForegroundPath)).toBe(true);
    expect(existsSync(adaptiveMonochromePath)).toBe(true);

    expect(app.expo.android.package).toBe('com.personal.alarmpyo');
    expect(app.expo.ios.bundleIdentifier).toBe('com.personal.alarmpyo');
    expect(app.expo.scheme).toBe('alarmpyo');
    expect(app.expo.slug).toBe('alarmpyo');
  });

  it('APK 승격은 한 번 배포하고 실패 시 로컬 공개 정보를 복구합니다', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/promote-android-release.mjs'),
      'utf8',
    );
    expect(source).toContain('readFileSnapshot');
    expect(source).toContain('restoreFileSnapshot');
    expect(source).toContain('previous-android.json');
    expect(source).toContain("'--apply'");
    expect(source.match(/runNpm\('deploy:web'\)/g)).toHaveLength(1);
    expect(source).toContain("process.env.ALARMPYO_DEPLOY_VERIFY_RELEASE = '1'");
    expect(source.indexOf("runNpm('release:source')")).toBeLessThan(
      source.indexOf("runNpm('release:manifest')"),
    );
    expect(source).toContain('staged.sourceCommit !== readCurrentCommit()');
    expect(source).toContain('staged.easBuildId');
    const validator = readFileSync(
      resolve(process.cwd(), 'scripts/validate-release.mjs'),
      'utf8',
    );
    expect(validator).toContain('const allowHistoricalManifestVersion');
    expect(validator).toContain('acceptsManifestVersion');
    expect(validator).toContain('verify=${Date.now()}');
    expect(validator).toContain("cache: 'no-store'");
    expect(source).toContain('이전 상태로 되돌려요');
  });

  it('웹 배포 뒤 production alias를 명시적으로 연결합니다', () => {
    const pkg = readJson('package.json');
    expect(pkg.scripts['deploy:web']).toContain(
      'node scripts/deploy-production.mjs',
    );
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/deploy-production.mjs'),
      'utf8',
    );
    expect(source).toContain('await verifyStagedDeployment(staged.url)');
    expect(source.indexOf('await verifyStagedDeployment(staged.url)')).toBeLessThan(
      source.indexOf('await promote(staged.identifier)'),
    );
    expect(source).toContain('await promote(previousIdentifier)');
    expect(source).toContain('ALARMPYO_PREVIOUS_DEPLOYMENT_ID');
    expect(source).toContain(
      'await verifyPreviousDeployment(productionUrl, rollbackManifestPath)',
    );
    expect(source).toContain(
      'restoreFileSnapshot(statePath, previousStateSnapshot)',
    );
    expect(source).toContain("'--prod'");
    expect(source).toContain("'--id'");
  });

  it('새 운영 인증서 연결 전에는 신뢰 지문을 비워 둡니다', () => {
    const policy = readJson('release-policy.json');
    expect(policy.keepPublicApkVersions).toBe(3);
    expect(policy.releaseState).toBe('blocked');
    expect(policy.releaseBlockers).toEqual(['productionHostingUrl']);
    expect(policy.productionHostingUrl).toBeNull();
    expect(policy.signingCertificateSha256).toEqual([
      '49a23f9cc1ef3055b0f601720d6262863e27726718cf5ce6caf4f0062acabe6a',
    ]);
  });
});
