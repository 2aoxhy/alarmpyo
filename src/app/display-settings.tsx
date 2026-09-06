import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Card, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { ToggleRow } from '@/design-system';
import { useDisplaySettingsController } from '@/features/display-settings/display-settings-controller';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { WidgetDisplayOptions } from '@/models/app-data';
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
  const {
    androidWidgetSupported,
    requestWidget,
    widgetPinBusy,
  } = useDisplaySettingsController(data);

  const handleWidgetRequest = async () => {
    const result = await requestWidget();
    if (result.status === 'requested' || result.status === 'ignored') return;
    if (result.status === 'installed') {
        showDialog('위젯 추가됨', '홈 화면에서 확인할 수 있습니다.');
        return;
    }
    if (result.status === 'manual') {
      showDialog(
        '위젯 직접 추가',
        '홈 화면 길게 누르기 → 위젯 목록 → 알람표 선택',
      );
      return;
    }
    showDialog(
      '위젯 추가 실패',
      '다시 시도하거나 홈 화면 위젯 목록에서 알람표 선택',
    );
  };

  return (
    <Screen contentStyle={styles.root} safeAreaEdges={['left', 'right']}>
      <Stack.Screen options={{ title: '홈 화면 위젯' }} />
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText tone="secondary">4×1·4×2 위젯 표시 정보</AppText>
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
                key={option.key}
                onValueChange={() => void toggleWidgetDisplayOption(option.key)}
                subtitle={
                  !androidWidgetSupported
                    ? '안드로이드 전용'
                    : required
                      ? '하나 이상 필요'
                    : selected
                      ? '표시 중'
                      : '숨김'
                }
                style={styles.widgetOption}
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
          onPress={() => void handleWidgetRequest()}
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
    sectionHeader: { gap: spacing.tiny },
    widgetOptions: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: _palette.line,
    },
    widgetOption: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: _palette.line,
    },
    platformNotice: {
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: _palette.line,
    },
  });
