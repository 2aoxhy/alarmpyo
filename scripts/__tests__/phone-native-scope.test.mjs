import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const nativeRoot = 'modules/alarmpyo-alarm/android';
const source = (relativePath) => readFileSync(resolve(process.cwd(), nativeRoot, relativePath), 'utf8');

describe('phone-only native alarm scope', () => {
  it('does not package the cancelled watch bridge or its dependency', () => {
    expect(source('build.gradle')).not.toMatch(/wearShared|play-services-wearable/u);
    expect(source('src/main/AndroidManifest.xml')).not.toMatch(/AlarmPyoWear|com\.google\.android\.gms\.wearable|scheme="wear"/u);
    const nativeFiles = readdirSync(resolve(process.cwd(), nativeRoot, 'src/main/java/expo/modules/alarmpyoalarm'));
    expect(nativeFiles.filter((name) => name.startsWith('AlarmPyoWear'))).toEqual([]);
  });

  it.each(['AlarmPyoAlarmScheduler', 'AlarmPyoQuickTimerScheduler'])('keeps %s independent from watch synchronization', (scheduler) => {
    expect(source(`src/main/java/expo/modules/alarmpyoalarm/${scheduler}.kt`)).not.toMatch(/AlarmPyoWear|WearAlarmProtocol/u);
  });

  it('retains the phone alarm, timer, restore and widget receivers', () => {
    const manifest = source('src/main/AndroidManifest.xml');
    for (const component of ['AlarmPyoAlarmService', 'AlarmPyoAlarmReceiver', 'AlarmPyoQuickTimerReceiver', 'AlarmPyoAlarmRestoreReceiver', 'AlarmPyoShiftWidgetProvider']) {
      expect(manifest).toContain(`android:name="expo.modules.alarmpyoalarm.${component}"`);
    }
    expect(manifest).toContain('android.intent.action.LOCKED_BOOT_COMPLETED');
    expect(manifest).toContain('android.appwidget.action.APPWIDGET_UPDATE');
  });
});
