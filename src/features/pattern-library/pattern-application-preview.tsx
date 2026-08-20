import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { SelectionPill } from '@/components/selection-controls';
import { AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { Surface } from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';
import { buildCalendarGrid, formatKoreanDate } from '@/utils/date';

import {
  buildPatternPreviewMonths,
  formatPatternCalendarShiftToken,
  getPatternPreviewMonthKey,
  isPatternDiffRowChanged,
  resolvePatternPreviewRow,
  type OverrideResolutionMode,
  type PatternDiffRow,
} from './pattern-library-model';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

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
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stacked = width <= 320 || fontScale >= 1.5;
  const stackCalendarTokens = width <= 412 || fontScale >= 1.3;
  const months = useMemo(() => buildPatternPreviewMonths(rows), [rows]);
  const rowByDate = useMemo(
    () => new Map(rows.map((row) => [row.dateKey, row] as const)),
    [rows],
  );
  const changedDateCount = useMemo(
    () => rows.filter(isPatternDiffRowChanged).length,
    [rows],
  );
  const [requestedDateKey, setRequestedDateKey] = useState<string | null>(null);
  const [requestedMonthKey, setRequestedMonthKey] = useState<string | null>(null);
  const [changesOnly, setChangesOnly] = useState(false);
  const effectiveChangesOnly = changesOnly && changedDateCount > 0;
  const navigableMonths = useMemo(
    () =>
      effectiveChangesOnly
        ? months.filter((month) =>
            rows.some(
              (row) =>
                getPatternPreviewMonthKey(row.dateKey) === month.key &&
                isPatternDiffRowChanged(row),
            ),
          )
        : months,
    [effectiveChangesOnly, months, rows],
  );
  const selectedRow = effectiveChangesOnly
    ? rows.find(
        (row) =>
          row.dateKey === requestedDateKey && isPatternDiffRowChanged(row),
      ) ??
      rows.find(
        (row) =>
          getPatternPreviewMonthKey(row.dateKey) === requestedMonthKey &&
          isPatternDiffRowChanged(row),
      ) ??
      rows.find(isPatternDiffRowChanged) ??
      null
    : resolvePatternPreviewRow(rows, requestedDateKey, requestedMonthKey);
  const selectedMonthKey = selectedRow
    ? getPatternPreviewMonthKey(selectedRow.dateKey)
    : null;
  const visibleMonth =
    navigableMonths.find((month) => month.key === requestedMonthKey) ??
    navigableMonths.find((month) => month.key === selectedMonthKey) ??
    navigableMonths[0] ??
    null;
  const visibleMonthIndex = visibleMonth
    ? navigableMonths.findIndex((month) => month.key === visibleMonth.key)
    : -1;
  const cells = useMemo(
    () =>
      visibleMonth
        ? buildCalendarGrid(visibleMonth.year, visibleMonth.month)
        : [],
    [visibleMonth],
  );
  const cellRows = useMemo(
    () =>
      Array.from({ length: cells.length / 7 }, (_, rowIndex) =>
        cells.slice(rowIndex * 7, rowIndex * 7 + 7),
      ),
    [cells],
  );

  const selectDate = (row: PatternDiffRow) => {
    setRequestedDateKey(row.dateKey);
    setRequestedMonthKey(getPatternPreviewMonthKey(row.dateKey));
  };

  const showMonth = (monthIndex: number) => {
    const month = navigableMonths[monthIndex];
    if (!month) return;
    const monthRows = rows.filter(
      (row) => getPatternPreviewMonthKey(row.dateKey) === month.key,
    );
    const nextSelected = effectiveChangesOnly
      ? monthRows.find(isPatternDiffRowChanged) ?? null
      : resolvePatternPreviewRow(monthRows, null);
    setRequestedMonthKey(month.key);
    setRequestedDateKey(nextSelected?.dateKey ?? null);
  };

  const showChanges = () => {
    setChangesOnly(true);
    if (selectedRow && isPatternDiffRowChanged(selectedRow)) return;
    const firstChanged = rows.find(isPatternDiffRowChanged);
    if (firstChanged) selectDate(firstChanged);
  };

  const showAllDates = () => {
    setChangesOnly(false);
    const effectiveDateRow = rows[0];
    if (effectiveDateRow) selectDate(effectiveDateRow);
  };

  if (!visibleMonth || !selectedRow) return null;

  const preservesOverride =
    selectedRow.hasDirectOverride &&
    (mode === 'preserve' ||
      (mode === 'select' && selectedDateKeys.has(selectedRow.dateKey)));
  const selectedStatus = selectedRow.changed
    ? '근무가 변경됩니다.'
    : selectedRow.scheduledShiftChanged
      ? '예외 일정 아래의 근무 순서가 변경됩니다.'
      : '근무가 유지됩니다.';

  return (
    <View accessibilityLabel="적용 전 달력 비교" style={styles.container}>
      <View style={styles.filterSection}>
        <View style={styles.filterHeading}>
          <AppText accessibilityRole="header" variant="heading">
            달력에서 비교
          </AppText>
          <AppText tone="secondary" variant="caption">
            적용일부터 다음 달력 범위까지 확인할 수 있습니다.
          </AppText>
        </View>
        <View
          accessibilityLabel="비교 날짜 필터"
          accessibilityRole="radiogroup"
          style={[styles.filters, stacked && styles.filtersStacked]}>
          <SelectionPill
            label="전체 날짜"
            onPress={showAllDates}
            selected={!effectiveChangesOnly}
            style={styles.filter}
          />
          <SelectionPill
            disabled={changedDateCount === 0}
            label={`변경 ${changedDateCount}일`}
            onPress={showChanges}
            selected={effectiveChangesOnly}
            style={styles.filter}
          />
        </View>
      </View>

      <Surface style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <MonthNavigationButton
            disabled={visibleMonthIndex <= 0}
            icon="chevron-back"
            label="이전 비교 월"
            onPress={() => showMonth(visibleMonthIndex - 1)}
          />
          <View
            accessible
            accessibilityLabel={`${visibleMonth.label} 비교 달력`}
            style={styles.monthTitle}>
            <AppText maxFontSizeMultiplier={1.5} variant="heading">
              {visibleMonth.label}
            </AppText>
            <AppText maxFontSizeMultiplier={1.5} tone="secondary" variant="caption">
              비교 범위 {visibleMonthIndex + 1}/{navigableMonths.length}
            </AppText>
          </View>
          <MonthNavigationButton
            disabled={visibleMonthIndex >= navigableMonths.length - 1}
            icon="chevron-forward"
            label="다음 비교 월"
            onPress={() => showMonth(visibleMonthIndex + 1)}
          />
        </View>

        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.weekdayRow}>
          {WEEKDAYS.map((weekday, index) => (
            <View key={weekday} style={styles.weekdayCell}>
              <AppText
                maxFontSizeMultiplier={1.4}
                tone={index === 0 || index === 6 ? 'secondary' : 'tertiary'}
                variant="caption">
                {weekday}
              </AppText>
            </View>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {cellRows.map((calendarRow) => (
            <View key={calendarRow[0].dateKey} style={styles.calendarRow}>
              {calendarRow.map((cell) => {
                const previewRow = cell.inCurrentMonth
                  ? rowByDate.get(cell.dateKey) ?? null
                  : null;
                const filteredOut = Boolean(
                  previewRow && effectiveChangesOnly && !isPatternDiffRowChanged(previewRow),
                );
                return (
                  <PatternCalendarDayCell
                    cellDay={cell.day}
                    changed={previewRow ? isPatternDiffRowChanged(previewRow) : false}
                    filteredOut={filteredOut}
                    inCurrentMonth={cell.inCurrentMonth}
                    key={cell.dateKey}
                    onPress={previewRow ? () => selectDate(previewRow) : undefined}
                    row={previewRow}
                    selected={previewRow?.dateKey === selectedRow.dateKey && !filteredOut}
                    stackTokens={stackCalendarTokens}
                  />
                );
              })}
            </View>
          ))}
        </View>

        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={styles.changeLegendMark} />
            <AppText tone="secondary" variant="caption">변경</AppText>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.overrideLegendMark} />
            <AppText tone="secondary" variant="caption">직접 수정</AppText>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.selectedLegendMark} />
            <AppText tone="secondary" variant="caption">선택한 날짜</AppText>
          </View>
        </View>
      </Surface>

      <Surface style={styles.detailCard} tone="muted">
        <View style={styles.detailHeading}>
          <AppText accessibilityRole="header" variant="heading">
            {selectedRow.dateLabel}
          </AppText>
          <AppText
            tone={isPatternDiffRowChanged(selectedRow) ? 'secondary' : 'tertiary'}
            variant="caption">
            {selectedStatus}
            {selectedRow.hasDirectOverride ? ' 직접 수정이 있습니다.' : ''}
          </AppText>
        </View>

        <View
          accessibilityLabel={`현재 ${selectedRow.currentLabel}${selectedRow.currentTimeLabel ? ` ${selectedRow.currentTimeLabel}` : ''}. 적용 후 ${selectedRow.nextLabel}${selectedRow.nextTimeLabel ? ` ${selectedRow.nextTimeLabel}` : ''}.`}
          accessible
          style={[styles.comparison, stacked && styles.comparisonStacked]}>
          <ComparisonValue
            label="현재"
            shiftLabel={selectedRow.currentLabel}
            timeLabel={selectedRow.currentTimeLabel}
          />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.changeArrow}>
            <AppIcon
              color={palette.inkSoft}
              name={stacked ? 'chevron-down' : 'chevron-forward'}
              size={20}
            />
          </View>
          <ComparisonValue
            emphasized
            label="적용 후"
            shiftLabel={selectedRow.nextLabel}
            timeLabel={selectedRow.nextTimeLabel}
          />
        </View>

        {mode === 'select' && selectedRow.hasDirectOverride ? (
          <SelectionPill
            accessibilityHint="선택하면 이 날짜의 직접 수정을 유지합니다."
            accessibilityRole="checkbox"
            label="이 날짜의 직접 수정 유지"
            onPress={() => onTogglePreservedDate(selectedRow.dateKey)}
            selected={preservesOverride}
            style={styles.overrideControl}
          />
        ) : selectedRow.hasDirectOverride ? (
          <AppText tone={preservesOverride ? 'secondary' : 'tertiary'} variant="body">
            {preservesOverride
              ? '이 날짜의 직접 수정을 유지합니다.'
              : '이 날짜의 직접 수정을 제거합니다.'}
          </AppText>
        ) : null}
      </Surface>
    </View>
  );
}

function MonthNavigationButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled: boolean;
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const focus = useWebFocusVisible();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onPress={onPress}
      style={({ pressed }) => [
        styles.monthButton,
        disabled && styles.monthButtonDisabled,
        pressed && !disabled && styles.pressed,
        focus.focusVisible && !disabled && styles.focusVisible,
      ]}>
      <AppIcon
        accessible={false}
        color={disabled ? palette.disabledInk : palette.indigoDark}
        name={icon}
        size={20}
      />
    </Pressable>
  );
}

function PatternCalendarDayCell({
  cellDay,
  changed,
  filteredOut,
  inCurrentMonth,
  onPress,
  row,
  selected,
  stackTokens,
}: {
  cellDay: number;
  changed: boolean;
  filteredOut: boolean;
  inCurrentMonth: boolean;
  onPress?: () => void;
  row: PatternDiffRow | null;
  selected: boolean;
  stackTokens: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const focus = useWebFocusVisible();
  const unavailable = !row || filteredOut;
  const currentToken = row
    ? formatPatternCalendarShiftToken(row.currentShiftTypeId, row.currentLabel)
    : '';
  const nextToken = row
    ? formatPatternCalendarShiftToken(row.nextShiftTypeId, row.nextLabel)
    : '';
  const changeLabel = row?.changed
    ? '근무 변경'
    : row?.scheduledShiftChanged
      ? '예외 일정 아래 근무 변경'
      : '근무 유지';

  if (!inCurrentMonth) {
    return (
      <View
        accessible={false}
        style={[
          styles.dayCell,
          stackTokens && styles.dayCellStacked,
          styles.dayCellOutside,
        ]}
      />
    );
  }

  if (unavailable) {
    return (
      <View
        accessible={false}
        style={[
          styles.dayCell,
          stackTokens && styles.dayCellStacked,
          styles.dayCellUnavailable,
        ]}>
        <AppText maxFontSizeMultiplier={1.4} tone="tertiary" variant="caption">
          {cellDay}
        </AppText>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint="선택하면 이 날짜의 변경 내용을 아래에서 확인합니다."
      accessibilityLabel={`${formatKoreanDate(row.dateKey, true)}. 현재 ${row.currentLabel}${row.currentTimeLabel ? ` ${row.currentTimeLabel}` : ''}. 적용 후 ${row.nextLabel}${row.nextTimeLabel ? ` ${row.nextTimeLabel}` : ''}. ${changeLabel}${row.hasDirectOverride ? '. 직접 수정 있음' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayCell,
        stackTokens && styles.dayCellStacked,
        changed && styles.dayCellChanged,
        selected && styles.dayCellSelected,
        pressed && styles.pressed,
        focus.focusVisible && styles.focusVisible,
      ]}>
      <View
        style={[
          styles.dayNumberRow,
          selected && styles.dayNumberRowSelected,
        ]}>
        <AppText maxFontSizeMultiplier={1.4} style={styles.dayNumber} variant="caption">
          {cellDay}
        </AppText>
        {selected ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.selectedCheck}>
            <AppIcon accessible={false} color={palette.canvas} name="checkmark" size={10} />
          </View>
        ) : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.shiftTokens, stackTokens && styles.shiftTokensStacked]}>
        <AppText maxFontSizeMultiplier={1.25} style={styles.shiftToken} variant="caption">
          {currentToken}
        </AppText>
        {changed ? (
          <>
            <AppText
              maxFontSizeMultiplier={1.15}
              style={styles.tokenArrow}
              tone="tertiary"
              variant="caption">
              {stackTokens ? '↓' : '›'}
            </AppText>
            <AppText maxFontSizeMultiplier={1.25} style={styles.shiftToken} variant="caption">
              {nextToken}
            </AppText>
          </>
        ) : null}
      </View>
      {changed ? <View style={styles.changeMark} /> : null}
      {row.hasDirectOverride ? <View style={styles.overrideMark} /> : null}
    </Pressable>
  );
}

function ComparisonValue({
  emphasized = false,
  label,
  shiftLabel,
  timeLabel,
}: {
  emphasized?: boolean;
  label: string;
  shiftLabel: string;
  timeLabel: string | null;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.comparisonValue, emphasized && styles.comparisonValueEmphasized]}>
      <AppText tone="secondary" variant="caption">{label}</AppText>
      <AppText variant="heading">{shiftLabel}</AppText>
      {timeLabel ? <AppText tone="secondary" variant="caption">{timeLabel}</AppText> : null}
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    container: { gap: spacing.large },
    filterSection: { gap: spacing.medium },
    filterHeading: { gap: spacing.tiny },
    filters: { flexDirection: 'row', gap: spacing.small },
    filtersStacked: { flexDirection: 'column' },
    filter: { minWidth: 0, flex: 1 },
    calendarCard: { overflow: 'hidden', padding: 0 },
    monthHeader: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
      backgroundColor: palette.surfaceSoft,
    },
    monthTitle: { minWidth: 0, flex: 1, alignItems: 'center', gap: 2 },
    monthButton: {
      width: 48,
      height: 48,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.controlLine,
      borderRadius: radii.small,
      backgroundColor: palette.surface,
    },
    monthButtonDisabled: {
      borderColor: palette.line,
      backgroundColor: palette.disabledSurface,
    },
    weekdayRow: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    weekdayCell: {
      minWidth: 0,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.tiny,
    },
    calendarGrid: { backgroundColor: palette.surface },
    calendarRow: { flexDirection: 'row' },
    dayCell: {
      minWidth: 0,
      minHeight: 64,
      flex: 1,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 3,
      paddingHorizontal: 2,
      paddingVertical: 5,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: palette.line,
      backgroundColor: palette.surface,
    },
    dayCellOutside: { backgroundColor: palette.surfaceSoft },
    dayCellStacked: { minHeight: 80 },
    dayCellUnavailable: { backgroundColor: palette.disabledSurface },
    dayCellChanged: {
      borderWidth: 2,
      borderColor: palette.blue,
      backgroundColor: palette.blueSoft,
    },
    dayCellSelected: {
      borderWidth: 2,
      borderColor: palette.selectionBorder,
      backgroundColor: palette.selectionSurface,
    },
    dayNumberRow: {
      width: '100%',
      minHeight: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayNumberRowSelected: { paddingRight: 14 },
    dayNumber: {
      fontSize: 12,
      lineHeight: 16,
      fontVariant: ['tabular-nums'],
    },
    selectedCheck: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 14,
      height: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 7,
      backgroundColor: palette.white,
    },
    shiftTokens: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
    },
    shiftTokensStacked: { flexDirection: 'column', gap: 0 },
    shiftToken: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
    tokenArrow: { fontSize: 10, lineHeight: 14 },
    changeMark: {
      position: 'absolute',
      top: 0,
      left: 8,
      right: 8,
      height: 3,
      borderBottomLeftRadius: 2,
      borderBottomRightRadius: 2,
      backgroundColor: palette.blue,
    },
    overrideMark: {
      position: 'absolute',
      bottom: 3,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: palette.mint,
    },
    legend: {
      minHeight: 44,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.medium,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderTopWidth: 1,
      borderTopColor: palette.line,
      backgroundColor: palette.surfaceSoft,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.tiny },
    changeLegendMark: {
      width: 18,
      height: 3,
      borderRadius: 2,
      backgroundColor: palette.blue,
    },
    overrideLegendMark: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: palette.mint,
    },
    selectedLegendMark: {
      width: 16,
      height: 16,
      borderWidth: 2,
      borderColor: palette.selectionBorder,
      borderRadius: 5,
      backgroundColor: palette.selectionSurface,
    },
    detailCard: { gap: spacing.large, padding: spacing.large },
    detailHeading: { gap: spacing.tiny },
    comparison: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.small },
    comparisonStacked: { flexDirection: 'column' },
    comparisonValue: {
      minWidth: 0,
      minHeight: 88,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.tiny,
      padding: spacing.medium,
      borderWidth: 1,
      borderColor: palette.controlLine,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    comparisonValueEmphasized: {
      borderWidth: 2,
      borderColor: palette.selectionBorder,
      backgroundColor: palette.selectionSurface,
    },
    changeArrow: {
      minWidth: 28,
      minHeight: 28,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    overrideControl: { width: '100%' },
    pressed: { transform: [{ scale: 0.985 }] },
    focusVisible:
      Platform.OS === 'web'
        ? {
            zIndex: 2,
            outlineColor: palette.focus,
            outlineOffset: -2,
            outlineStyle: 'solid',
            outlineWidth: 2,
          }
        : {},
  });
}
