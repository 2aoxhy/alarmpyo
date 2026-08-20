// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('V11 Android 타이머·업데이트 계약', () => {
  it('기존 타이머 식별자와 저장 namespace를 유지합니다', () => {
    const scheduler = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoQuickTimerScheduler.kt',
    );
    const store = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoQuickTimerStore.kt',
    );

    expect(scheduler).toContain('TIMER_PLAN_ID = "__alarmpyo_quick_timer__"');
    expect(scheduler).toContain('TIMER_REQUEST_CODE = 0x54494D');
    expect(store).toContain('"alarmpyo-quick-timer-v1-primary"');
    expect(store).toContain('"alarmpyo-quick-timer-v1-redundant"');
    expect(store).toContain('LEGACY_SCHEMA_VERSION = 1');
  });

  it('45분과 일시정지·재개·초기화 API를 양쪽 계약에 제공합니다', () => {
    const moduleSource = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmModule.kt',
    );
    const typescript = source('modules/alarmpyo-alarm/index.ts');

    expect(typescript).toContain('durationMinutes: 30 | 45 | 60 | null;');
    expect(typescript).toContain("| 'paused'");
    for (const name of [
      'pauseQuickTimerAsync',
      'resumeQuickTimerAsync',
      'resetQuickTimerAsync',
    ]) {
      expect(moduleSource).toContain(`AsyncFunction("${name}")`);
      expect(typescript).toContain(`${name}?()`);
    }
  });

  it('4회 짧은 진동과 볼륨 키 종료만 적용합니다', () => {
    const service = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmService.kt',
    );
    const activity = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmActivity.kt',
    );

    expect(service).toContain('240L, 160L');
    expect(service).toContain('240L, 800L');
    expect(service).toContain('VibrationAttributes.USAGE_ALARM');
    expect(activity).toContain('KeyEvent.KEYCODE_VOLUME_UP');
    expect(activity).toContain('KeyEvent.KEYCODE_VOLUME_DOWN');
    expect(activity).not.toContain('KeyEvent.KEYCODE_POWER');
    expect(activity).toContain('finishAlarm(ACTION_DISMISS_ALARM)');
  });

  it('Play Core 2.1.0과 직접 배포 unsupported 폴백을 함께 제공합니다', () => {
    const gradle = source('modules/alarmpyo-alarm/android/build.gradle');
    const play = source(
      'modules/alarmpyo-alarm/android/src/play/java/expo/modules/alarmpyoalarm/AlarmPyoDistributionApi.kt',
    );
    const direct = source(
      'modules/alarmpyo-alarm/android/src/direct/java/expo/modules/alarmpyoalarm/AlarmPyoDistributionApi.kt',
    );

    expect(gradle).toContain("com.google.android.play:app-update:2.1.0");
    expect(play).toContain('AppUpdateType.FLEXIBLE');
    expect(play).toContain('startUpdateFlow(');
    expect(play).toContain('completeUpdate()');
    expect(
      [...play.matchAll(/\bAsyncFunction\s*\(\s*"([^"]+)"/gu)].map(
        (match) => match[1],
      ),
    ).toEqual([
      'getPlayUpdateStatusAsync',
      'startPlayUpdateAsync',
      'completePlayUpdateAsync',
    ]);
    for (const forbidden of [
      'AlarmPyoApkInstaller',
      'verifyAndOpenApkInstallerAsync',
      'FileProvider',
      'ACTION_INSTALL_PACKAGE',
      'canRequestPackageInstalls',
    ]) {
      expect(play).not.toContain(forbidden);
    }
    expect(direct).toContain('AlarmPyoPlayUpdateStatus.unsupported()');
    expect(direct).toContain('AlarmPyoPlayUpdateStartResult.unsupported()');
    expect(direct).toContain('AlarmPyoPlayUpdateCompleteResult.unsupported()');
  });
});
