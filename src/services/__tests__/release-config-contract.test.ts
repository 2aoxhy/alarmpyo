// Vitest는 Node.js에서 실행되지만 앱의 Expo 전용 tsconfig은 Node 타입을 노출하지 않습니다.
// @ts-expect-error 테스트 런너에서 제공하는 Node.js 표준 모듈입니다.
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error 테스트 런너에서 제공하는 Node.js 표준 모듈입니다.
import { resolve } from 'node:path';
// @ts-expect-error 테스트 런너에서 제공하는 Node.js 표준 모듈입니다.
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8'));
}

type DecodedRgbaPng = {
  height: number;
  pixels: Uint8Array;
  width: number;
};

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function paethPredictor(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodeRgbaPng(relativePath: string, expectedSize = 1024): DecodedRgbaPng {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), relativePath)));
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const compressedChunks: Uint8Array[] = [];

  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = readUint32BigEndian(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    expect(dataEnd + 4).toBeLessThanOrEqual(bytes.length);

    if (type === 'IHDR') {
      width = readUint32BigEndian(bytes, dataStart);
      height = readUint32BigEndian(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlaceMethod = bytes[dataStart + 12];
    } else if (type === 'IDAT') {
      compressedChunks.push(bytes.slice(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  expect({ bitDepth, colorType, height, interlaceMethod, width }).toMatchObject({
    bitDepth: 8,
    colorType: 6,
    height: expectedSize,
    interlaceMethod: 0,
    width: expectedSize,
  });

  const compressedLength = compressedChunks.reduce(
    (total, chunk) => total + chunk.length,
    0,
  );
  const compressed = new Uint8Array(compressedLength);
  let compressedOffset = 0;
  for (const chunk of compressedChunks) {
    compressed.set(chunk, compressedOffset);
    compressedOffset += chunk.length;
  }

  const inflated = new Uint8Array(inflateSync(compressed));
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  expect(inflated.length).toBe((rowLength + 1) * height);

  const pixels = new Uint8Array(rowLength * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    expect(filter).toBeGreaterThanOrEqual(0);
    expect(filter).toBeLessThanOrEqual(4);

    const rowOffset = y * rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[sourceOffset];
      sourceOffset += 1;
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[rowOffset - rowLength + x] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[rowOffset - rowLength + x - bytesPerPixel]
          : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : paethPredictor(left, up, upperLeft);
      pixels[rowOffset + x] = (raw + predictor) & 0xff;
    }
  }

  return { height, pixels, width };
}

function findAlphaBounds(image: DecodedRgbaPng) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.pixels[(y * image.width + x) * 4 + 3];
      if (alpha === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  expect(maxX).toBeGreaterThanOrEqual(minX);
  expect(maxY).toBeGreaterThanOrEqual(minY);
  return {
    height: maxY - minY + 1,
    maxX,
    maxY,
    minX,
    minY,
    width: maxX - minX + 1,
  };
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
      env: { ALARMPYO_DISTRIBUTION: 'direct' },
    });
  });

  it('내부 canary는 새 Expo 프로젝트를 사용하고 공개 direct 배포 주소는 비워 둡니다', () => {
    const pkg = readJson('package.json');
    const app = readJson('app.json');
    expect(pkg.overrides.uuid).toBe('11.1.1');
    expect(app.expo.updates).toEqual({
      enabled: true,
      url: `https://u.expo.dev/${app.expo.extra.eas.projectId}`,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    });
    expect(app.expo.extra.apkUpdateManifestUrls).toBeUndefined();
    expect(app.expo.extra.apkUpdateManifestUrl).toBeUndefined();
    expect(app.expo.owner).toBeUndefined();
    expect(app.expo.extra.eas.projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
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
    const faviconPath = resolve(process.cwd(), 'assets/images/favicon.png');

    expect(app.expo.name).toBe('알람표');
    expect(app.expo.description).toBe(
      '주간·교대 근무표와 기상 알람을 간편하게 관리해요',
    );
    expect(pkg.version).toBe('1.0.4');
    expect(app.expo.version).toBe('1.0.4');
    expect(app.expo.android.versionCode).toBe(5);
    expect(app.expo.ios.buildNumber).toBe('5');
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
    expect(app.expo.web.favicon).toBe('./assets/images/favicon.png');
    expect(existsSync(appIconPath)).toBe(true);
    expect(existsSync(adaptiveForegroundPath)).toBe(true);
    expect(existsSync(adaptiveMonochromePath)).toBe(true);
    expect(existsSync(faviconPath)).toBe(true);
    expect(decodeRgbaPng('assets/images/favicon.png', 48)).toMatchObject({
      height: 48,
      width: 48,
    });

    expect(app.expo.android.package).toBe('com.personal.alarmpyo');
    expect(app.expo.ios.bundleIdentifier).toBe('com.personal.alarmpyo');
    expect(app.expo.scheme).toBe('alarmpyo');
    expect(app.expo.slug).toBe('alarmpyo');
    expect(app.expo.userInterfaceStyle).toBe('dark');
    expect(
      app.expo.plugins.find(
        (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
      )?.[1],
    ).toMatchObject({
      backgroundColor: '#101214',
      image: './assets/images/splash-transparent.png',
      imageWidth: 160,
    });
  });

  it('Android 적응형 아이콘을 안전 영역 안에 두고 단색 마스크를 일치시킵니다', () => {
    const app = readJson('app.json');
    const foreground = decodeRgbaPng(
      'assets/images/alarmpyo-adaptive-foreground.png',
    );
    const monochrome = decodeRgbaPng(
      'assets/images/alarmpyo-adaptive-monochrome.png',
    );
    const foregroundBounds = findAlphaBounds(foreground);
    const monochromeBounds = findAlphaBounds(monochrome);
    const safeInset = Math.ceil((foreground.width * 21) / 108);
    const safeRadius = (foreground.width * 33) / 108;
    const minimumLogoSize = Math.floor((foreground.width * 48) / 108);

    expect(app.expo.android.adaptiveIcon.backgroundColor).toBe('#101214');
    expect(foregroundBounds).toEqual(monochromeBounds);
    expect(foregroundBounds.minX).toBeGreaterThanOrEqual(safeInset);
    expect(foregroundBounds.minY).toBeGreaterThanOrEqual(safeInset);
    expect(foregroundBounds.maxX).toBeLessThan(foreground.width - safeInset);
    expect(foregroundBounds.maxY).toBeLessThan(foreground.height - safeInset);
    expect(foregroundBounds.width).toBeGreaterThanOrEqual(minimumLogoSize);
    expect(foregroundBounds.height).toBeGreaterThanOrEqual(minimumLogoSize);
    expect(
      Math.abs(
        (foregroundBounds.minX + foregroundBounds.maxX) / 2 -
          (foreground.width - 1) / 2,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (foregroundBounds.minY + foregroundBounds.maxY) / 2 -
          (foreground.height - 1) / 2,
      ),
    ).toBeLessThanOrEqual(1);

    let alphaMismatchCount = 0;
    let maximumOpaquePixelRadius = 0;
    let nonWhiteMonochromePixelCount = 0;
    for (let offset = 0; offset < foreground.pixels.length; offset += 4) {
      const foregroundAlpha = foreground.pixels[offset + 3];
      const monochromeAlpha = monochrome.pixels[offset + 3];
      if (foregroundAlpha > 0) {
        const pixelIndex = offset / 4;
        const x = pixelIndex % foreground.width;
        const y = Math.floor(pixelIndex / foreground.width);
        maximumOpaquePixelRadius = Math.max(
          maximumOpaquePixelRadius,
          Math.hypot(
            x - (foreground.width - 1) / 2,
            y - (foreground.height - 1) / 2,
          ),
        );
      }
      if (foregroundAlpha !== monochromeAlpha) alphaMismatchCount += 1;
      if (
        monochromeAlpha > 0 &&
        (monochrome.pixels[offset] < 250 ||
          monochrome.pixels[offset + 1] < 250 ||
          monochrome.pixels[offset + 2] < 250)
      ) {
        nonWhiteMonochromePixelCount += 1;
      }
    }
    expect(alphaMismatchCount).toBe(0);
    expect(maximumOpaquePixelRadius).toBeLessThanOrEqual(safeRadius);
    expect(nonWhiteMonochromePixelCount).toBe(0);
  });

  it('네이티브 전체 화면 알람도 밝은 시스템 바 없이 다크 배경을 사용합니다', () => {
    const styles = readFileSync(
      resolve(
        process.cwd(),
        'modules/alarmpyo-alarm/android/src/main/res/values/styles.xml',
      ),
      'utf8',
    );
    const colors = readFileSync(
      resolve(
        process.cwd(),
        'modules/alarmpyo-alarm/android/src/main/res/values/colors.xml',
      ),
      'utf8',
    );

    expect(styles).toContain('parent="android:style/Theme.Material.NoActionBar"');
    expect(styles).toContain('<item name="android:windowLightNavigationBar">false</item>');
    expect(styles).toContain('<item name="android:windowLightStatusBar">false</item>');
    expect(styles).toContain(
      '<item name="android:windowBackground">@color/alarmpyo_background</item>',
    );
    expect(colors).toContain('<color name="alarmpyo_background">#101214</color>');
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

  it('direct 인증서를 고정하고 Hosting만 공개 릴리스 blocker로 둡니다', () => {
    const policy = readJson('release-policy.json');
    expect(policy.keepPublicApkVersions).toBe(3);
    expect(policy.releaseState).toBe('blocked');
    expect(policy.releaseBlockers).toEqual(['productionHostingUrl']);
    expect(policy.productionHostingUrl).toBeNull();
    expect(policy.signingCertificateSha256).toHaveLength(1);
    expect(policy.signingCertificateSha256[0]).toMatch(/^[0-9a-f]{64}$/u);
  });
});
