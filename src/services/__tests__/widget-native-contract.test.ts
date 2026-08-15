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
    expect(widgetInfo).toContain(
      'android:previewLayout="@layout/alarmpyo_shift_widget_preview"',
    );
    expect(widgetInfo).toContain(
      'android:previewImage="@drawable/alarmpyo_widget_preview_image"',
    );
  });

  it('선택기 미리보기에는 회사별로 달라지는 날짜와 시간을 고정하지 않아요', () => {
    const runtimeLayout = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/layout/alarmpyo_shift_widget_compact.xml',
    );
    const previewLayout = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/layout/alarmpyo_shift_widget_preview.xml',
    );
    const previewImage = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/drawable/alarmpyo_widget_preview_image.xml',
    );
    const allPreviewSources = [runtimeLayout, previewLayout, previewImage].join('\n');

    expect(allPreviewSources).not.toMatch(/7월 13일|07:00|18:00|05:10/);
    expect(runtimeLayout).toContain('@string/alarmpyo_widget_preview_schedule');
    expect(previewLayout).toContain('@string/alarmpyo_widget_preview_schedule');
    expect(previewImage).toContain('@color/alarmpyo_widget_card_background');
  });

  it('홈 런처가 만들 수 있는 RemoteViews 지원 요소만 사용해요', () => {
    const widgetLayout = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/layout/alarmpyo_shift_widget_compact.xml',
    );
    const previewLayout = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/layout/alarmpyo_shift_widget_preview.xml',
    );

    [widgetLayout, previewLayout].forEach((layout) => {
      expect(layout).not.toMatch(/<View(?:\s|>)/);
      expect(layout).not.toMatch(/<Space(?:\s|>)/);
    });
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

  it('다크그레이 위젯의 글자와 조작 경계 대비를 유지해요', () => {
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
    const background = colorMap.get('alarmpyo_widget_card_background');
    const softBackground = colorMap.get('alarmpyo_widget_card_background_soft');
    const primary = colorMap.get('alarmpyo_text_primary');
    const secondary = colorMap.get('alarmpyo_text_secondary');
    const border = colorMap.get('alarmpyo_widget_card_border');

    expect(background).toBeDefined();
    expect(softBackground).toBeDefined();
    expect(primary).toBeDefined();
    expect(secondary).toBeDefined();
    expect(border).toBeDefined();
    [background!, softBackground!].forEach((surface) => {
      expect(contrastRatio(primary!, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(secondary!, surface)).toBeGreaterThanOrEqual(4.5);
    });
    expect(contrastRatio(border!, background!)).toBeGreaterThanOrEqual(3);
  });

  it('근무 의미색은 대비가 충분한 작은 아이콘에만 사용해요', () => {
    const colors = readSource(
      'modules/alarmpyo-alarm/android/src/main/res/values/colors.xml',
    );
    const drawableNames = ['day', 'night', 'off', 'training', 'reserve', 'unknown'];

    drawableNames.forEach((name) => {
      const drawable = readSource(
        `modules/alarmpyo-alarm/android/src/main/res/drawable/alarmpyo_widget_${name}_background.xml`,
      );
      expect(drawable).toContain(
        '<solid android:color="@color/alarmpyo_widget_card_background" />',
      );
      expect(drawable).not.toContain('<gradient');
    });
    const colorMap = new Map<string, string>();
    colors.split(/\r?\n/).forEach((line: string) => {
      const match = line.match(
        /<color name="([^"]+)">(#(?:[0-9A-Fa-f]{6}))<\/color>/,
      );
      if (match) colorMap.set(match[1], match[2]);
    });
    const background = colorMap.get('alarmpyo_widget_card_background');
    expect(background).toBeDefined();
    drawableNames.forEach((name) => {
      const iconColor = colorMap.get(`alarmpyo_widget_icon_${name}`);
      expect(iconColor).toBeDefined();
      expect(contrastRatio(iconColor!, background!)).toBeGreaterThanOrEqual(3);
    });
  });

  it('Android 15 생성형 미리보기는 실제 바인더를 재사용하고 실패를 저장 실패로 전파하지 않아요', () => {
    const providerSource = readSource(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoShiftWidgetProvider.kt',
    );
    const policySource = readSource(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoWidgetPreviewPolicy.kt',
    );
    const moduleSource = readSource(
      'modules/alarmpyo-alarm/android/src/main/java/expo/modules/alarmpyoalarm/AlarmPyoAlarmModule.kt',
    );
    const syncWidgetBlock = moduleSource.slice(
      moduleSource.indexOf('AsyncFunction("syncWidgetAsync")'),
      moduleSource.indexOf('AsyncFunction("isWidgetInstalledAsync")'),
    );

    expect(providerSource).toContain('setWidgetPreview(');
    expect(providerSource).toContain(
      'AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN',
    );
    expect(providerSource).toContain('createRemoteViews(');
    expect(providerSource).toContain('AlarmPyoWidgetPreviewUpdateResult.RATE_LIMITED');
    expect(providerSource).toContain('catch (_: Exception)');
    expect(providerSource).toContain('catch (_: LinkageError)');
    expect(policySource).toContain('MIN_SUPPORTED_API = 35');
    expect(policySource).toContain('RETRY_COOLDOWN_MILLIS = 30L * 60L * 1_000L');
    expect(policySource).toContain('MessageDigest.getInstance("SHA-256")');
    expect(syncWidgetBlock).toContain('AlarmPyoShiftWidgetUpdater.updateAll(context)');
    expect(syncWidgetBlock).not.toContain('isInstalled(context)');
  });
});
