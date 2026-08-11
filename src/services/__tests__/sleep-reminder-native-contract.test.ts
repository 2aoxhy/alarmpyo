// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('Android 수면 시작 알림 계약', () => {
  it('14일 전체 계획을 기기 보호 저장소에 원자적으로 저장해요', () => {
    const contract = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderContract.kt',
    );
    const store = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderStore.kt',
    );

    expect(contract).toContain('SLEEP_REMINDER_PLAN_HORIZON_DAYS = 14');
    expect(contract).toContain('MAX_STORED_SLEEP_REMINDERS = 64');
    expect(store).toContain('createDeviceProtectedStorageContext()');
    expect(store).toContain('.putString(KEY_SNAPSHOT, encoded).commit()');
  });

  it('가까운 세 알림만 부정확 절전 예약으로 유지해요', () => {
    const scheduler = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderScheduler.kt',
    );
    const policy = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderPolicy.kt',
    );

    expect(policy).toContain('take(MAX_SCHEDULED_SLEEP_REMINDERS)');
    expect(scheduler).toContain('setAndAllowWhileIdle');
    expect(scheduler).not.toMatch(/setExact|setAlarmClock/);
    expect(scheduler).toContain('consumeAndReplenish');
  });

  it('동일한 계획과 예약 ID는 AlarmManager에 다시 등록하지 않아요', () => {
    const scheduler = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderScheduler.kt',
    );
    const policy = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderPolicy.kt',
    );

    expect(policy).toContain('canReuseScheduledSnapshot');
    expect(scheduler).toContain('canReuseScheduledSnapshot');
    expect(scheduler.indexOf('canReuseScheduledSnapshot')).toBeLessThan(
      scheduler.indexOf('AlarmPyoSleepReminderStore.write'),
    );
  });

  it('시간대가 바뀌어도 저장한 현지 취침 시각을 유지해요', () => {
    const contract = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderContract.kt',
    );
    const policy = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderPolicy.kt',
    );
    const scheduler = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderScheduler.kt',
    );
    const restoreReceiver = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmRestoreReceiver.kt',
    );

    expect(contract).toContain('localDateKey');
    expect(contract).toContain('localMinutes');
    expect(policy).toContain('recalculateReminderAt');
    expect(scheduler).toContain('recalculateLocalTimes');
    expect(restoreReceiver).toContain('Intent.ACTION_TIME_CHANGED');
    expect(restoreReceiver).toContain('Intent.ACTION_TIMEZONE_CHANGED');
  });

  it('일반 알림 채널과 별도 수신기를 사용해요', () => {
    const channel = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderChannels.kt',
    );
    const receiver = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoSleepReminderReceiver.kt',
    );
    const manifest = source(
      'modules/alarmpyo-alarm/android/src/main/AndroidManifest.xml',
    );

    expect(channel).toContain('NotificationManager.IMPORTANCE_DEFAULT');
    expect(channel).toContain('setBypassDnd(false)');
    expect(receiver).not.toMatch(/FullScreen|startForegroundService|MediaPlayer/);
    expect(manifest).toContain('AlarmPyoSleepReminderReceiver');
    expect(manifest).toMatch(
      /AlarmPyoSleepReminderReceiver[\s\S]*?android:directBootAware="true"/,
    );
  });

  it('공개 API와 POST_NOTIFICATIONS 전용 요청 및 채널 복구 경로를 제공해요', () => {
    const moduleSource = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmModule.kt',
    );
    const typescript = source('modules/alarmpyo-alarm/index.ts');
    const permissionBlock = moduleSource.slice(
      moduleSource.indexOf('private fun requestSleepReminderPermission'),
      moduleSource.indexOf('private fun sleepReminderStatus'),
    );

    for (const name of [
      'syncSleepRemindersAsync',
      'cancelSleepRemindersAsync',
      'getSleepReminderStatusAsync',
      'requestSleepReminderPermissionAsync',
      'openSleepReminderSettingsAsync',
    ]) {
      expect(moduleSource).toContain(`AsyncFunction("${name}")`);
      expect(typescript).toContain(`${name}?`);
    }
    expect(permissionBlock).toContain('Manifest.permission.POST_NOTIFICATIONS');
    expect(permissionBlock).toContain('AlarmPyoSleepReminderChannels.openSettings(context)');
    expect(permissionBlock).not.toMatch(/exactAlarm|fullScreen|SCHEDULE_EXACT_ALARM/);
  });
});
