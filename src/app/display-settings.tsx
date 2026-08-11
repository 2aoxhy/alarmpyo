import { Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Card, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { SegmentedControl, ToggleRow } from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeMode, WidgetDisplayOptions } from '@/models/app-data';
import { requestPreparedAlarmPyoWidgetPin } from '@/services/widget-pin-service';
import { useAppStoreActions, useAppStoreData } from '@/store/app-store';

const THEME_OPTIONS: readonly { label: string; value: ThemeMode }[] = [
  { label: '자동', value: 'system' },
  { label: '라이트', value: 'light' },
  { label: '다크', value: 'dark' },
];

const WIDGET_OPTIONS: readonly {
  key: keyof WidgetDisplayOptions;
  label: string;
}[] = [
  { key: 'todayShift', label: '오늘 근무' },
  { key: 'nextShift', label: '다음 근무' },
  { key: 'nextAlarm', label: '다음 알람' },
];

export default function DisplaySettingsScreen() {
  const { showDialog } = useAppDialog();
  const { data } = useAppStoreData();
  const { setThemeMode, toggleWidgetDisplayOption } = useAppStoreActions();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [widgetPinBusy, setWidgetPinBusy] = useState(false);
  const androidWidgetSupported = Platform.OS === 'android';

  const requestWidget = async () => {
    if (widgetPinBusy || !androidWidgetSupported) return;
    setWidgetPinBusy(true);
    try {
      const result = await requestPreparedAlarmPyoWidgetPin(data);
      if (result.status === 'requested') return;
      if (result.status === 'installed') {
        showDialog('이미 추가되어 있어요', '홈 화면에서 알람표 위젯을 확인하세요.');
        return;
      }
      showDialog(
        '홈 화면에서 직접 추가하세요',
        '홈 화면을 길게 누른 뒤 위젯 목록에서 알람표를 선택하세요.',
      );
    } catch {
      showDialog(
        '위젯 추가 요청을 열지 못했어요',
        '잠시 후 다시 시도하거나 홈 화면의 위젯 목록에서 알람표를 선택하세요.',
      );
    } finally {
      setWidgetPinBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.root} safeAreaEdges={['left', 'right']}>
      <Stack.Screen options={{ title: '화면·위젯' }} />
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText accessibilityRole="header" variant="heading">화면 테마</AppText>
          <AppText color={palette.inkMuted}>휴대폰과 앱의 밝기를 맞춰요.</AppText>
        </View>
        <SegmentedControl
          label="화면 테마"
          onChange={setThemeMode}
          options={THEME_OPTIONS}
          value={data.settings.themeMode}
        />
      </Card>

      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText accessibilityRole="header" variant="heading">홈 화면 위젯</AppText>
          <AppText color={palette.inkMuted}>4×1 위젯에 표시할 정보를 선택해요.</AppText>
        </View>
        {!androidWidgetSupported ? (
          <View accessible style={styles.platformNotice}>
            <AppText color={palette.inkMuted} variant="caption">
              홈 화면 위젯은 안드로이드에서만 지원해요.
            </AppText>
          </View>
        ) : null}
        <View style={styles.widgetOptions}>
          {WIDGET_OPTIONS.map((option) => {
            const selected = data.settings.widgetDisplayOptions[option.key];
            const selectedCount = WIDGET_OPTIONS.filter(
              ({ key }) => data.settings.widgetDisplayOptions[key],
            ).length;
            const required = selected && selectedCount === 1;
            return (
              <ToggleRow
                disabled={!androidWidgetSupported || required}
                icon={
                  option.key === 'todayShift'
                    ? 'calendar-outline'
                    : option.key === 'nextShift'
                      ? 'arrow-forward'
                      : 'alarm-outline'
                }
                key={option.key}
                onValueChange={() => void toggleWidgetDisplayOption(option.key)}
                subtitle={
                  !androidWidgetSupported
                    ? '안드로이드에서만 설정할 수 있어요.'
                    : required
                      ? '위젯에는 한 가지 이상의 정보를 표시해야 해요.'
                    : selected
                      ? '위젯에 표시 중이에요.'
                      : '위젯에서 숨겨져 있어요.'
                }
                title={option.label}
                value={selected}
              />
            );
          })}
        </View>
        <AppButton
          accessibilityHint={
            androidWidgetSupported
              ? '알람표 위젯을 홈 화면에 추가해요.'
              : '홈 화면 위젯은 안드로이드에서만 지원해요.'
          }
          disabled={!androidWidgetSupported}
          icon="add"
          label="홈 화면에 추가하기"
          loading={widgetPinBusy}
          onPress={() => void requestWidget()}
          variant="secondary"
        />
      </Card>
    </Screen>
  );
}

const createStyles = (_palette: AppPalette) =>
  StyleSheet.create({
    root: {
      gap: spacing.large,
    },
    section: { gap: spacing.large },
    sectionHeader: { alignItems: 'center', gap: spacing.tiny },
    widgetOptions: {
      gap: spacing.small,
    },
    platformNotice: {
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderRadius: 12,
      backgroundColor: _palette.surfaceSoft,
    },
  });
