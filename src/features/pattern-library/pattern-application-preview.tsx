import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Card } from '@/components/ui-kit';
import { SelectionPill } from '@/components/selection-controls';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';

import type { OverrideResolutionMode, PatternDiffRow } from './pattern-library-model';

export function PatternApplicationPreview({
  mode,
  onTogglePreservedDate,
  rows,
  selectedDateKeys,
}: {
  mode: OverrideResolutionMode;
  onTogglePreservedDate: (dateKey: string) => void;
  rows: readonly PatternDiffRow[];
  selectedDateKeys: ReadonlySet<string>;
}) {
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stacked = width <= 320 || fontScale >= 1.5;

  return (
    <View accessibilityLabel="향후 42일 비교" style={styles.list}>
      {rows.map((row) => {
        const preservesOverride =
          row.hasDirectOverride &&
          (mode === 'preserve' ||
            (mode === 'select' && selectedDateKeys.has(row.dateKey)));
        return (
          <Card density="compact" key={row.dateKey} style={styles.row}>
            <View style={[styles.rowMain, stacked && styles.rowMainStacked]}>
              <View style={styles.dateCopy}>
                <AppText variant="label">{row.dateLabel}</AppText>
                <AppText tone="tertiary" variant="caption">
                  {row.changed
                    ? '근무 변경'
                    : row.scheduledShiftChanged
                      ? '예외 일정 아래 근무 변경'
                      : '근무 유지'}
                  {row.hasDirectOverride ? ' · 직접 수정 있음' : ''}
                </AppText>
              </View>
              <View
                accessibilityLabel={`현재 ${row.currentLabel}${row.currentTimeLabel ? ` ${row.currentTimeLabel}` : ''}, 적용 후 ${row.nextLabel}${row.nextTimeLabel ? ` ${row.nextTimeLabel}` : ''}`}
                accessible
                style={[styles.change, stacked && styles.changeStacked]}>
                <View style={[styles.valuePill, stacked && styles.valuePillStacked]}>
                  <AppText variant="label">{row.currentLabel}</AppText>
                  {row.currentTimeLabel ? (
                    <AppText tone="secondary" variant="caption">
                      {row.currentTimeLabel}
                    </AppText>
                  ) : null}
                </View>
                <AppText tone="tertiary" variant="caption">
                  {stacked ? '↓' : '→'}
                </AppText>
                <View
                  style={[
                    styles.valuePill,
                    styles.valuePillNext,
                    stacked && styles.valuePillStacked,
                  ]}>
                  <AppText variant="label">{row.nextLabel}</AppText>
                  {row.nextTimeLabel ? (
                    <AppText tone="secondary" variant="caption">
                      {row.nextTimeLabel}
                    </AppText>
                  ) : null}
                </View>
              </View>
            </View>
            {mode === 'select' && row.hasDirectOverride ? (
              <SelectionPill
                accessibilityHint="선택하면 이 날의 직접 수정을 유지합니다."
                accessibilityRole="checkbox"
                label="직접 수정 유지"
                onPress={() => onTogglePreservedDate(row.dateKey)}
                selected={preservesOverride}
                style={styles.preserveControl}
              />
            ) : row.hasDirectOverride ? (
              <AppText tone={preservesOverride ? 'secondary' : 'tertiary'} variant="caption">
                {preservesOverride
                  ? '이 날의 직접 수정을 유지합니다.'
                  : '이 날의 직접 수정을 제거합니다.'}
              </AppText>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    list: {
      gap: spacing.small,
    },
    row: {
      gap: spacing.medium,
      padding: spacing.medium,
    },
    rowMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    rowMainStacked: {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
    dateCopy: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    change: {
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
    },
    changeStacked: {
      width: '100%',
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    valuePill: {
      minWidth: 72,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.small,
      borderWidth: 1,
      borderColor: palette.controlLine,
      borderRadius: 999,
      backgroundColor: palette.surfaceSoft,
      gap: 2,
    },
    valuePillStacked: {
      width: '100%',
    },
    valuePillNext: {
      borderWidth: 2,
      borderColor: palette.selectionBorder,
      backgroundColor: palette.selectionSurface,
    },
    preserveControl: {
      width: '100%',
    },
  });
}
