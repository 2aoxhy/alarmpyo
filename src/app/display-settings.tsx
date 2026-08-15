import { Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Card, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { ToggleRow } from '@/design-system';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { WidgetDisplayOptions } from '@/models/app-data';
import { requestPreparedAlarmPyoWidgetPin } from '@/services/widget-pin-service';
import { useAppStoreActions, useAppStoreData } from '@/store/app-store';

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
  const { toggleWidgetDisplayOption } = useAppStoreActions();
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
        showDialog('이미 추가되어 있습니다', '홈 화면에서 알람표 위젯을 확인해야 합니다.');
        return;
      }
      showDialog(
        '홈 화면에서 직접 추가해야 합니다',
        '홈 화면을 길게 누른 뒤 위젯 목록에서 알람표를 선택해야 합니다.',
      );
    } catch {
      showDialog(
        '위젯 추가 요청을 열지 못했습니다',
        '잠시 후 다시 시도하거나 홈 화면의 위젯 목록에서 알람표를 선택해야 합니다.',
      );
    } finally {
      setWidgetPinBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.root} safeAreaEdges={['left', 'right']}>
      <Stack.Screen options={{ title: '홈 화면 위젯' }} />
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText tone="secondary">4×1 위젯에 표시할 정보를 선택합니다.</AppText>
        </View>
        {!androidWidgetSupported ? (
          <View accessible style={styles.platformNotice}>
            <AppText tone="secondary" variant="caption">
              홈 화면 위젯은 안드로이드에서만 지원합니다.
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
                    ? '안드로이드에서만 설정할 수 있습니다.'
                    : required
                      ? '위젯에는 한 가지 이상의 정보를 표시해야 합니다.'
                    : selected
                      ? '위젯에 표시 중입니다.'
                      : '위젯에서 숨겨져 있습니다.'
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
              ? '알람표 위젯을 홈 화면에 추가합니다.'
              : '홈 화면 위젯은 안드로이드에서만 지원합니다.'
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
