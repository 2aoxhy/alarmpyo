// Vitest는 Node.js에서 실행되지만 앱의 Expo 전용 tsconfig은 Node 타입을 노출하지 않습니다.
// @ts-expect-error 테스트 런너에서 제공하는 Node.js 표준 모듈입니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error 테스트 런너에서 제공하는 Node.js 표준 모듈입니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

describe('안드로이드 홈 화면 위젯 등록', () => {
  it('홈 화면 provider와 시스템 추가 요청을 함께 등록해요', () => {
    const manifest = readSource(
      'modules/alarmpyo-alarm/android/src/main/AndroidManifest.xml',
    );
    const moduleSource = readSource(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmModule.kt',
    );
    const providerSource = readSource(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoShiftWidgetProvider.kt',
    );

    expect(manifest).toContain('AlarmPyoShiftWidgetProvider');
    expect(manifest).toContain('android.appwidget.action.APPWIDGET_UPDATE');
    expect(manifest).toContain('@xml/alarmpyo_shift_widget_info');
    expect(moduleSource).toContain('AsyncFunction("requestWidgetPinAsync")');
    expect(providerSource).toContain('requestPinAppWidget');
    expect(providerSource).toContain('isRequestPinAppWidgetSupported');
  });

  it('4×1 기본 크기와 작은 런처의 가로 공간을 함께 지원해요', () => {
    const widgetInfo = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/xml/alarmpyo_shift_widget_info.xml',
    );

    expect(widgetInfo).toContain('android:targetCellWidth="4"');
    expect(widgetInfo).toContain('android:targetCellHeight="1"');
    expect(widgetInfo).toContain('android:minWidth="180dp"');
    expect(widgetInfo).toContain('android:resizeMode="horizontal"');
    expect(widgetInfo).toContain('android:widgetCategory="home_screen"');
  });

  it('홈 런처가 만들 수 있는 RemoteViews 지원 요소만 사용해요', () => {
    const widgetLayout = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/layout/alarmpyo_shift_widget_compact.xml',
    );

    expect(widgetLayout).not.toMatch(/<View(?:\s|>)/);
    expect(widgetLayout).not.toMatch(/<Space(?:\s|>)/);
    expect(widgetLayout).toContain(
      'android:id="@+id/alarmpyo_widget_secondary_divider"',
    );
  });

  it('4×1 위젯의 모든 글자는 12sp 이상이고 긴 보조 정보는 축약해요', () => {
    const widgetLayout = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/layout/alarmpyo_shift_widget_compact.xml',
    );
    const providerSource = readSource(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoShiftWidgetProvider.kt',
    );
    const textSizes = (widgetLayout.match(/android:textSize="[\d.]+sp"/g) ?? [])
      .map((declaration: string) => Number(declaration.match(/[\d.]+/)?.[0]));

    expect(textSizes.length).toBeGreaterThan(0);
    expect(Math.min(...textSizes)).toBeGreaterThanOrEqual(12);
    expect(providerSource).toContain('"다음 근무" -> "다음"');
    expect(providerSource).toContain('"다음 알람" -> "알람"');
    expect(providerSource).toContain('context.resources.configuration.fontScale');
    expect(providerSource).toContain('fontScale >= 1.8f');
    expect(providerSource).not.toMatch(/if \(hasTertiary\) (?:9|10|11)f/);
  });

  it('56dp 높이에서는 핵심 두 정보만 표시하고 크기 변경 즉시 다시 그려요', () => {
    const widgetInfo = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/xml/alarmpyo_shift_widget_info.xml',
    );
    const providerSource = readSource(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoShiftWidgetProvider.kt',
    );
    const sizePolicySource = readSource(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoWidgetSizePolicy.kt',
    );

    expect(widgetInfo).toContain('android:minHeight="56dp"');
    expect(providerSource).toContain('onAppWidgetOptionsChanged');
    expect(providerSource).toContain('AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT');
    expect(providerSource).toContain('manager.getAppWidgetOptions(widgetId)');
    expect(providerSource).toContain('minimumHeight || largeText');
    expect(providerSource).toContain('minimumHeight || veryLargeText');
    expect(providerSource).toContain('minimumHeight || hasTertiary || largeText');
    expect(sizePolicySource).toContain('DEFAULT_MIN_HEIGHT_DP = 56');
    expect(sizePolicySource).toContain('MINIMUM_HEIGHT_MAX_DP = 64');
  });

  it('보조 문구는 모든 위젯 배경 끝 색에서 4.5대 1 이상의 대비를 유지해요', () => {
    const colors = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/values/colors.xml',
    );
    const colorMap = new Map<string, string>();
    colors.split(/\r?\n/).forEach((line: string) => {
      const match = line.match(
        /<color name="([^"]+)">(#(?:[0-9A-Fa-f]{6}))<\/color>/,
      );
      if (match) colorMap.set(match[1], match[2]);
    });
    const secondary = colorMap.get('alarmpyo_text_secondary');
    const backgroundNames = [
      'alarmpyo_day',
      'alarmpyo_night',
      'alarmpyo_off',
      'alarmpyo_training',
      'alarmpyo_reserve',
      'alarmpyo_unknown',
      'alarmpyo_widget_day_gradient_start',
      'alarmpyo_widget_night_gradient_start',
      'alarmpyo_widget_off_gradient_start',
      'alarmpyo_widget_training_gradient_start',
      'alarmpyo_widget_reserve_gradient_start',
      'alarmpyo_widget_unknown_gradient_start',
    ];

    expect(secondary).toBeDefined();
    backgroundNames.forEach((name) => {
      const background = colorMap.get(name);
      expect(background).toBeDefined();
      expect(contrastRatio(secondary!, background!)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
