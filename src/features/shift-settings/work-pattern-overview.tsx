import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { ShiftChip } from '@/components/shift-chip';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppData } from '@/models/app-data';
import { formatKoreanDate } from '@/utils/date';
import { getWorkPatternPreset, getWorkPatternPresetId } from '@/utils/work-pattern';

import { buildWorkScheduleOverview } from './shift-settings-model';

export function WorkPatternOverview({
  data,
  onBrowsePatterns,
  onEdit,
  today,
}: {
  data: AppData;
  onBrowsePatterns?: () => void;
  onEdit: () => void;
  today: string;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.45;
  const overview = useMemo(
    () => buildWorkScheduleOverview(data, today),
    [data, today],
  );
  const presetId = getWorkPatternPresetId(data.pattern.shiftTypeIds);
  const patternDescription =
    presetId === 'custom'
      ? `${data.pattern.shiftTypeIds.length}일 회사 순서로 반복합니다.`
      : getWorkPatternPreset(presetId).description;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <AppIcon
            accessible={false}
            color={palette.indigoDark}
            name={presetId === 'weekday' ? 'shift-day' : 'repeat'}
            size={24}
          />
        </View>
        <View style={styles.headerCopy}>
          <AppText accessibilityRole="header" variant="heading">
            {overview.patternName}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {patternDescription}
          </AppText>
        </View>
      </View>

      <View style={styles.previewHeading}>
        <AppText variant="label">미리 보기</AppText>
        <AppText tone="secondary" variant="caption">
          {overview.preview.length}일 일정
        </AppText>
      </View>
      <View style={[styles.previewGrid, stacked && styles.previewGridStacked]}>
        {overview.preview.map((item) => (
          <View
            accessibilityLabel={`${formatKoreanDate(item.dateKey)}. ${item.shift?.name ?? '일정 없음'}`}
            accessible
            key={item.dateKey}
            style={[styles.previewItem, stacked && styles.previewItemStacked]}>
            <AppText tone="secondary" variant="caption">
              {formatKoreanDate(item.dateKey)}
            </AppText>
            {item.shift ? (
              <ShiftChip compact shift={item.shift} />
            ) : (
              <AppText tone="tertiary" variant="caption">
                일정 없음
              </AppText>
            )}
          </View>
        ))}
      </View>

      <AppButton
        accessibilityHint="근무 방식을 변경합니다."
        icon="options-outline"
        label="근무 방식 수정하기"
        onPress={onEdit}
        variant="secondary"
      />
      {onBrowsePatterns ? (
        <AppButton
          accessibilityHint="공식 패턴, 내 패턴과 최근 적용 이력을 확인합니다."
          icon="book-outline"
          label="근무 패턴 보관함"
          onPress={onBrowsePatterns}
          variant="ghost"
        />
      ) : null}
    </Card>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: {
      gap: spacing.medium,
      padding: spacing.medium,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    headerIcon: {
      width: 48,
      height: 48,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: palette.indigoSoft,
    },
    headerCopy: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    previewHeading: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    previewGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
    },
    previewGridStacked: {
      flexDirection: 'column',
      flexWrap: 'nowrap',
    },
    previewItem: {
      minWidth: 144,
      minHeight: 72,
      flexBasis: '31%',
      flexGrow: 1,
      justifyContent: 'space-between',
      gap: spacing.small,
      padding: spacing.small,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    previewItemStacked: {
      width: '100%',
      minHeight: 56,
      flexBasis: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
    },
  });
}
