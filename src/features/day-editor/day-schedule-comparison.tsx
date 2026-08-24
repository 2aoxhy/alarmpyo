import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui-kit';
import { Button, space, useDesignSystemTheme } from '@/design-system';

import {
  buildDayShiftSummary,
  type DayShiftSummaryInput,
} from './day-editor-presentation';

export function DayScheduleComparison({
  baseShift,
  currentLabel,
  currentShift,
  hasDirectChange,
  onReset,
}: {
  baseShift: DayShiftSummaryInput;
  currentLabel?: string | null;
  currentShift: DayShiftSummaryInput;
  hasDirectChange: boolean;
  onReset: () => void;
}) {
  const { colors } = useDesignSystemTheme();
  const current = buildDayShiftSummary(currentShift, currentLabel);
  const base = buildDayShiftSummary(baseShift);

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      <AppText accessibilityRole="header" variant="label">
        일정 확인
      </AppText>
      <View style={styles.rows}>
        <View
          accessible
          accessibilityLabel={`현재 일정. ${current.accessibilityLabel}`}
          style={styles.row}>
          <AppText tone="secondary" style={styles.rowLabel} variant="caption">
            현재 일정
          </AppText>
          <View style={styles.rowCopy}>
            <AppText variant="label">{current.title}</AppText>
            <AppText tone="secondary" variant="caption">
              {current.detail}
            </AppText>
          </View>
        </View>
        <View
          accessible
          accessibilityLabel={`기본 일정. ${base.accessibilityLabel}`}
          style={styles.row}>
          <AppText tone="secondary" style={styles.rowLabel} variant="caption">
            기본 일정
          </AppText>
          <View style={styles.rowCopy}>
            <AppText variant="label">{base.title}</AppText>
            <AppText tone="secondary" variant="caption">
              {base.detail}
            </AppText>
          </View>
        </View>
      </View>
      {hasDirectChange ? (
        <Button
          accessibilityHint="근무, 시간, 특별 일정과 이날 알람을 기본값으로 되돌립니다. 메모는 유지합니다."
          icon="refresh-outline"
          label="기본 일정으로 되돌리기"
          onPress={onReset}
          size="compact"
          variant="ghost"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rows: { gap: space.sm },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  rowLabel: { width: 72, paddingTop: 2 },
  rowCopy: { minWidth: 0, flex: 1, gap: 2 },
});
