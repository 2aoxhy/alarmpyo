import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertBundlePageAlignment16K,
  assertNoForbiddenDexStrings,
  assertPlayJavascriptBundle,
  parsePlayManifest,
  validatePlayManifest,
  validateProvenanceBinding,
} from '../play-release-policy.mjs';

function source(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
  package="com.personal.alarmpyo"
  android:versionCode="1"
  android:versionName="1.0.0">
  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
  <application>
    <provider android:name="expo.modules.filesystem.FileSystemFileProvider"
      android:authorities="com.personal.alarmpyo.FileSystemFileProvider" />
  </application>
</manifest>`;

describe('Play AAB 하드닝', () => {
  it('bundle config가 Play 생성 APK에 16KB 정렬을 요청해야 해요', () => {
    expect(
      assertBundlePageAlignment16K(
        'compression { uncompressed_glob: "lib/**/*.so" }\noptimizations { alignment: PAGE_ALIGNMENT_16K }',
      ),
    ).toBe('PAGE_ALIGNMENT_16K');
    expect(() =>
      assertBundlePageAlignment16K(
        'optimizations { alignment: PAGE_ALIGNMENT_4K }',
      ),
    ).toThrow('16KB page alignment');
    expect(() => assertBundlePageAlignment16K('optimizations {}')).toThrow(
      'page alignment가 없어요',
    );
    expect(() =>
      assertBundlePageAlignment16K(
        'alignment: PAGE_ALIGNMENT_4K\nalignment: PAGE_ALIGNMENT_16K',
      ),
    ).toThrow('16KB page alignment');
  });

  it('매니페스트의 패키지·버전·targetSdk와 금지 구성을 검증해요', () => {
    expect(parsePlayManifest(manifestXml)).toMatchObject({
      packageName: 'com.personal.alarmpyo',
      versionCode: 1,
      versionName: '1.0.0',
      targetSdk: 36,
    });
    expect(
      validatePlayManifest(manifestXml, {
        packageName: 'com.personal.alarmpyo',
        versionCode: 1,
        versionName: '1.0.0',
        targetSdk: 36,
      }),
    ).toMatchObject({ targetSdk: 36 });

    expect(() =>
      validatePlayManifest(
        manifestXml.replace(
          'android:targetSdkVersion="36"',
          'android:targetSdkVersion="35"',
        ),
        {
          packageName: 'com.personal.alarmpyo',
          versionCode: 1,
          versionName: '1.0.0',
          targetSdk: 35,
        },
      ),
    ).toThrow('targetSdk는 36 이상');

    expect(() =>
      validatePlayManifest(
        manifestXml.replace(
          '</manifest>',
          '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" /></manifest>',
        ),
        {
          packageName: 'com.personal.alarmpyo',
          versionCode: 1,
          versionName: '1.0.0',
          targetSdk: 36,
        },
      ),
    ).toThrow('설치 권한');
  });

  it('Play DEX와 JavaScript 번들에 직접 APK 업데이트 코드가 남으면 실패해요', () => {
    expect(() =>
      assertNoForbiddenDexStrings([
        {
          name: 'base/dex/classes.dex',
          contents: Buffer.from('expo/modules/alarmpyoalarm/AlarmPyoApkInstaller'),
        },
      ]),
    ).toThrow('직접 APK 설치');
    expect(() =>
      assertPlayJavascriptBundle([
        { name: 'base/assets/index.android.bundle', contents: Buffer.from('ALARMPYO_DIRECT_APK_UPDATE_V1') },
      ]),
    ).toThrow('직접 APK 업데이트');
    expect(() =>
      assertPlayJavascriptBundle([
        { name: 'base/assets/index.android.bundle', contents: Buffer.from('ALARMPYO_PLAY_STORE_UPDATE_V1') },
      ]),
    ).not.toThrow();
  });

  it('AAB SHA-256와 소스 커밋에 묶인 출처 기록만 통과해요', () => {
    const artifact = {
      sha256: 'a'.repeat(64),
      sizeBytes: 123,
      packageName: 'com.personal.alarmpyo',
      versionName: '1.0.0',
      versionCode: 1,
      targetSdk: 36,
      pageAlignment: 'PAGE_ALIGNMENT_16K',
      releasePurpose: 'play-release',
      submissionEligible: true,
    };
    expect(
      validateProvenanceBinding(
        {
          schemaVersion: 1,
          artifactType: 'android-app-bundle',
          ...artifact,
          sourceCommit: 'b'.repeat(40),
          sourceDirty: false,
        },
        artifact,
      ),
    ).toBe(true);
    expect(() =>
      validateProvenanceBinding(
        {
          schemaVersion: 1,
          artifactType: 'android-app-bundle',
          ...artifact,
          sha256: 'c'.repeat(64),
          sourceCommit: 'b'.repeat(40),
          sourceDirty: false,
        },
        artifact,
      ),
    ).toThrow('sha256');
  });

  it('Play/direct 소스셋과 Metro 화면을 빌드 시점에 분리해요', () => {
    const gradle = source('modules/alarmpyo-alarm/android/build.gradle');
    const mainModule = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmModule.kt',
    );
    const playApi = source(
      'modules/alarmpyo-alarm/android/src/play/java/expo/modules/alarmpyoalarm/AlarmPyoDistributionApi.kt',
    );
    const metro = source('metro.config.js');
    expect(gradle).toContain('src/${alarmpyoDistribution}/java');
    expect(mainModule).toContain('registerAlarmPyoDistributionApi { context }');
    expect(mainModule).not.toContain('AlarmPyoApkInstaller');
    expect(mainModule).not.toContain('verifyAndOpenApkInstallerAsync');
    expect(playApi).not.toContain('AsyncFunction');
    expect(playApi).not.toContain('AlarmPyoApkInstaller');
    expect(metro).toContain("process.env.ALARMPYO_DISTRIBUTION === 'play'");
    expect(metro).toContain('play-app-update-screen.tsx');
  });

  it('Play 전용 사전 검증·AAB 빌드·내부 테스트 제출 명령을 고정해요', () => {
    const scripts = JSON.parse(source('package.json')).scripts;
    const preflight = source('scripts/run-play-preflight.mjs');
    const aabValidator = source('scripts/validate-play-aab.mjs');
    const evidenceValidator = source(
      'scripts/validate-play-release-evidence.mjs',
    );
    const submit = source('scripts/submit-play-internal.mjs');
    expect(scripts['release:preflight:play']).toBe('node scripts/run-play-preflight.mjs');
    expect(scripts['release:verify:aab']).toBe('node scripts/validate-play-aab.mjs');
    expect(scripts['release:verify:play-evidence']).toBe(
      'node scripts/validate-play-release-evidence.mjs',
    );
    expect(scripts['release:verify:play-privacy-url']).toBe(
      'node scripts/validate-play-privacy-url.mjs',
    );
    expect(scripts['build:aab']).toContain('--profile production');
    expect(scripts['submit:internal']).toBe('node scripts/submit-play-internal.mjs');
    expect(preflight).toContain('verifyExactToolchain();');
    for (const commonCheck of [
      "['run', 'release:source']",
      "['run', 'check']",
      "['run', 'audit:dependencies']",
      "['run', 'audit:tooling']",
      "'run-expo-doctor.mjs'",
      "'validate-ota-runtime.mjs'",
      "['run', 'test:android-native']",
    ]) {
      expect(preflight).toContain(commonCheck);
    }
    expect(preflight).not.toContain("['run', 'release:preflight']");
    expect(preflight).not.toContain('audit:artifacts');
    expect(preflight).not.toContain('validate-release.mjs');
    expect(preflight).toContain(
      "runNpm(['run', 'release:verify:play-privacy-url'])",
    );
    expect(preflight).toContain(
      'readReleasePolicy(root, { allowBlocked: true })',
    );
    expect(aabValidator).toContain(
      'readReleasePolicy(root, { allowBlocked: true })',
    );
    expect(evidenceValidator).toContain(
      'readReleasePolicy(root, { allowBlocked: true })',
    );
    expect(submit).not.toContain('readReleasePolicy');
  });

  it('Play 생성 APK·16KB 기기·사전 출시 보고서를 production 증거로 묶어요', () => {
    const releaseEvidenceSchema = JSON.parse(
      source('docs/play-release-evidence.schema.json'),
    );
    const deviceEvidenceSchema = JSON.parse(
      source('docs/play-device-evidence.schema.json'),
    );
    const preLaunchEvidenceSchema = JSON.parse(
      source('docs/play-prelaunch-evidence.schema.json'),
    );
    const validator = source('scripts/validate-play-release-evidence.mjs');

    expect(releaseEvidenceSchema.properties.schemaVersion.const).toBe(1);
    expect(releaseEvidenceSchema.required).toContain(
      'highestPreviouslyDistributedVersionCode',
    );
    expect(releaseEvidenceSchema.required).toContain(
      'highestExistingPlayVersionCode',
    );
    expect(releaseEvidenceSchema.required).toContain('pageSize16KbEvidence');
    expect(deviceEvidenceSchema.properties.evidenceType.enum).toEqual([
      'play-physical-device',
      'play-16kb-device',
    ]);
    expect(preLaunchEvidenceSchema.properties.status.const).toBe('completed');
    expect(validator).toContain('assertPlayReleaseEvidence');
    expect(validator).toContain("'.release/play/verified-release-evidence.json'");
  });
});
