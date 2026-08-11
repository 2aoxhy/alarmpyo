// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('Android 시스템 알람음 계약', () => {
  it('시스템 알람 선택기와 기기 전용 저장소를 사용해요', () => {
    const picker = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmSoundPickerContract.kt',
    );
    const store = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmSoundStore.kt',
    );
    const manifest = source(
      'modules/alarmpyo-alarm/android/src/main/AndroidManifest.xml',
    );

    expect(picker).toContain('ACTION_RINGTONE_PICKER');
    expect(picker).toContain('TYPE_ALARM');
    expect(picker).toContain('EXTRA_RINGTONE_SHOW_SILENT, false');
    expect(store).toContain('createDeviceProtectedStorageContext()');
    expect(store).toContain('PREFERENCES_NAME = "alarmpyo_alarm_sound"');
    expect(manifest).not.toMatch(/READ_MEDIA_AUDIO|READ_EXTERNAL_STORAGE/);
  });

  it('선택한 알람음을 먼저 시도한 뒤 기존 폴백을 유지해요', () => {
    const service = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmService.kt',
    );
    const policy = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmSoundPolicy.kt',
    );

    expect(service).toContain('AlarmPyoAlarmSoundStore.playbackCandidates(applicationContext)');
    expect(service).toContain('startFallbackTone(');
    expect(service).toContain('ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD');
    expect(policy.indexOf('selected?.takeIf')).toBeLessThan(
      policy.indexOf('defaultAlarm?.takeIf'),
    );
  });

  it('선택·조회·10초 미리 듣기·중지·복원 API를 제공해요', () => {
    const moduleSource = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmModule.kt',
    );
    const preview = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmSoundPreview.kt',
    );
    const typescript = source('modules/alarmpyo-alarm/index.ts');

    for (const name of [
      'getAlarmSoundAsync',
      'selectAlarmSoundAsync',
      'previewAlarmSoundAsync',
      'stopAlarmSoundPreviewAsync',
      'resetAlarmSoundAsync',
    ]) {
      expect(moduleSource).toContain(`AsyncFunction("${name}")`);
      expect(typescript).toContain(`${name}?(`);
    }
    expect(preview).toContain('PREVIEW_DURATION_MILLIS = 10_000L');
    expect(preview).toContain('PREVIEW_START_TIMEOUT_MILLIS = 5_000L');
    expect(preview).toContain('failTimedOutStart(activeGeneration)');
    expect(preview).toContain('prepared.start()');
    expect(preview).toContain('finishAttempt(activeGeneration, started = true)');
    expect(moduleSource).toContain('promise.resolve(started)');
  });
});
