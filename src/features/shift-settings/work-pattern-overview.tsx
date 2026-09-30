import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui-kit';
import { ShiftChip } from '@/components/shift-chip';
import { spacing, type AppPalette } from '@/constants/app-theme';
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
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText accessibilityRole="header" variant="heading">
            {overview.patternName}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {patternDescription}
          </AppText>
        </View>
      </View>

      <View
        style={[
          styles.previewHeading,
          stacked && styles.previewHeadingStacked,
        ]}>
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
        accessibilityHint="달력에 반복되는 근무 순서를 변경합니다."
        icon="options-outline"
        label="근무 순서 바꾸기"
        onPress={onEdit}
        variant="secondary"
      />
      {onBrowsePatterns ? (
        <AppButton
          accessibilityHint="저장한 근무 순서와 파일을 확인합니다."
          icon="book-outline"
          label="저장한 순서·파일 보기"
          onPress={onBrowsePatterns}
          variant="ghost"
        />
      ) : null}
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: {
      gap: spacing.medium,
      paddingVertical: spacing.small,
      paddingLeft: spacing.medium,
      borderLeftWidth: 2,
      borderLeftColor: palette.controlLine,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
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
    previewHeadingStacked: {
      alignItems: 'flex-start',
      flexDirection: 'column',
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
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
