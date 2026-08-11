import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REQUIRED_ANDROID_EMULATOR_CHECKS,
  REQUIRED_ANDROID_EMULATOR_SDKS,
  REQUIRED_ANDROID_PHYSICAL_CHECKS,
} from '../release-artifact-provenance.mjs';

const root = resolve(import.meta.dirname, '..', '..');

describe('Android 기기 승격 기준', () => {
  it('Samsung 실기기와 Android 12~16 에뮬레이터 증거를 승격 전에 요구해요', async () => {
    const promoter = await readFile(
      resolve(root, 'scripts', 'promote-android-release.mjs'),
      'utf8',
    );
    const validator = await readFile(
      resolve(root, 'scripts', 'validate-android-device-matrix.mjs'),
      'utf8',
    );
    const matrixSchema = JSON.parse(
      await readFile(
        resolve(root, 'docs', 'android-device-matrix.schema.json'),
        'utf8',
      ),
    );
    const evidenceSchema = JSON.parse(
      await readFile(
        resolve(root, 'docs', 'android-device-evidence.schema.json'),
        'utf8',
      ),
    );
    expect(REQUIRED_ANDROID_EMULATOR_SDKS).toEqual([31, 33, 34, 35, 36]);
    expect(REQUIRED_ANDROID_PHYSICAL_CHECKS).toEqual([
      'upgradePreservedData',
      'permissionsPreserved',
      'alarmWhileClosed',
      'alarmAfterReboot',
      'blockedNotificationState',
      'fullScreenAlarm',
      'widgetAvailable',
    ]);
    expect(REQUIRED_ANDROID_EMULATOR_CHECKS).toEqual([
      'installAndLaunch',
      'dataMigration',
      'alarmWhileClosed',
      'alarmAfterReboot',
      'blockedNotificationState',
      'fullScreenAlarm',
      'widgetAvailable',
    ]);
    expect(promoter.indexOf("runNpm('release:manifest')")).toBeLessThan(
      promoter.indexOf("runNpm('release:verify:device-matrix')"),
    );
    expect(validator).toContain('assertAndroidDeviceMatrixBinding');
    expect(validator).toContain("'.release/latest-android.json'");
    expect(validator).toContain("'.release/verified-device-matrix.json'");
    expect(validator).toContain('device-evidence');
    expect(matrixSchema.properties.schemaVersion.const).toBe(3);
    expect(matrixSchema.properties.emulators.minItems).toBe(5);
    expect(evidenceSchema.properties.captureMethod.const).toBe('adb');
  });
});
