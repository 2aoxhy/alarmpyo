// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('Android 네이티브 안전 계약', () => {
  it('알람 오디오 제어 권한과 중첩 방지 정책을 유지해요', () => {
    const manifest = source(
      'modules/alarmpyo-alarm/android/src/main/AndroidManifest.xml',
    );
    const runtimePolicy = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmRuntimePolicy.kt',
    );
    expect(manifest).toContain('android.permission.MODIFY_AUDIO_SETTINGS');
    expect(runtimePolicy).toContain('AUTOMATIC_REPEAT_DELAY_MILLIS');
    expect(runtimePolicy).toContain('REPEAT_OVERLAP_GUARD_MILLIS');
  });

  it('자동 재알람은 수신기가 아니라 실제 재생 확인 서비스에서만 예약해요', () => {
    const receiver = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmReceiver.kt',
    );
    const service = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmService.kt',
    );

    expect(receiver).not.toContain('ensureAutomaticSingleRepeat(');
    expect(receiver).not.toContain('AlarmPyoAlarmEventType.AUTO_REPEAT_');
    expect(receiver).toContain('EXTRA_AUTOMATIC_REPEAT_ELIGIBLE');
    expect(service).toContain('completeConfirmedDelivery(');
    expect(service).toContain('handleConfirmedPlayback(');
    expect(service).toContain(
      'allowAutomaticRepeat = playbackConfirmedRecorded && automaticRepeatEligible',
    );
    expect(service).not.toMatch(
      /retryAlreadyArmed = hasArmedRetry\s+playbackConfirmedRecorded = false\s+confirmDelivery/,
    );
  });

  it('위젯 설치 전에도 스냅샷을 저장하고 생성형 미리보기를 갱신해요', () => {
    const moduleSource = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmModule.kt',
    );
    const widgetModel = source(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoWidgetModel.kt',
    );
    const syncWidget = moduleSource.slice(
      moduleSource.indexOf('AsyncFunction("syncWidgetAsync")'),
      moduleSource.indexOf('AsyncFunction("isWidgetInstalledAsync")'),
    );

    expect(syncWidget.indexOf('AlarmPyoWidgetStore.write')).toBeLessThan(
      syncWidget.indexOf('AlarmPyoShiftWidgetUpdater.updateAll'),
    );
    expect(syncWidget).not.toContain('AlarmPyoShiftWidgetUpdater.isInstalled');
    expect(syncWidget.trimEnd()).toMatch(/true\s*}\s*$/);
    expect(widgetModel).toContain('entriesJson.length() in 1..367');
    expect(widgetModel).toContain('alarmsJson.length() <= 366');
  });

  it('release 빌드는 debug 서명으로 대체하지 않아요', () => {
    const plugin = source('plugins/with-release-signing-guard.js');
    const app = JSON.parse(source('app.json'));
    expect(app.expo.plugins).toContain(
      './plugins/with-release-signing-guard.js',
    );
    expect(plugin).toContain('alarmpyoHasInjectedReleaseSigning');
    expect(plugin).toContain("System.getenv('EAS_BUILD') == 'true'");
    expect(plugin).toContain('signingConfig signingConfigs.alarmpyoRelease');
    expect(plugin).toContain('Debug signing is never allowed');
  });

  it('OEM 설치 화면은 INSTALL_PACKAGE 다음 VIEW 경로를 사용해요', () => {
    const policy = source(
      'modules/alarmpyo-alarm/android/src/direct/java/expo/modules/alarmpyoalarm/AlarmPyoApkInstallIntentPolicy.kt',
    );
    expect(policy.indexOf('INSTALL_PACKAGE')).toBeLessThan(
      policy.indexOf('ACTION_VIEW'),
    );
  });
});
