// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import fs from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Android alarm safety contract', () => {
  it('uses one inexact idle-safe check with a private non-DND notification channel', () => {
    const scheduler = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmSafetyScheduler.kt',
    );

    expect(scheduler).toContain('setAndAllowWhileIdle');
    expect(scheduler).not.toContain('setExactAndAllowWhileIdle');
    expect(scheduler).toContain('Notification.VISIBILITY_PRIVATE');
    expect(scheduler).toContain('setBypassDnd(false)');
    expect(scheduler).toContain('alarmpyo:///alarm-settings');
  });

  it('journals a two-minute watchdog before a single-executor restore', () => {
    const receiver = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmRestoreReceiver.kt',
    );

    expect(receiver).toContain('TimeUnit.MINUTES.toMillis(2)');
    expect(receiver).toContain('prepareTransaction(appContext, action)');
    expect(receiver).toContain('Executors.newSingleThreadExecutor');
    expect(receiver).toContain('goAsync()');
    expect(receiver).not.toContain('WorkManager');
    expect(receiver.indexOf('prepareTransaction(appContext, action)')).toBeLessThan(
      receiver.indexOf('goAsync()'),
    );
    expect(receiver.indexOf('AlarmPyoAlarmRestoreStateStore.begin(')).toBeLessThan(
      receiver.indexOf('scheduleRestoreWakeup(context, watchdogAt)'),
    );
  });

  it('keeps the safety receiver direct-boot aware and rearms from lifecycle mutations', () => {
    const manifest = source('modules/alarmpyo-alarm/android/src/main/AndroidManifest.xml');
    const scheduler = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmScheduler.kt',
    );

    expect(manifest).toContain('expo.modules.alarmpyoalarm.AlarmPyoAlarmSafetyReceiver');
    expect(manifest).toMatch(
      /AlarmPyoAlarmSafetyReceiver[\s\S]*?android:directBootAware="true"/,
    );
    expect(scheduler.match(/rearmSafetyCheck\(/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('exposes only the requested optional safety status fields', () => {
    const moduleContract = source('modules/alarmpyo-alarm/index.ts');

    expect(moduleContract).toContain('alarmSafety?:');
    expect(moduleContract).toContain('nextCheckAt: number;');
    expect(moduleContract).toContain('lastCheckedAt: number;');
    expect(moduleContract).toContain('issueCodes: string[];');
    expect(moduleContract).toContain('lastNotifiedAt: number;');
  });
});
