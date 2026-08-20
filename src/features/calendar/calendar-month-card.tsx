import { memo, type Ref } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppText, Card } from '@/components/ui-kit';
import {
  radii,
  spacing,
  type AppPalette,
} from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppData } from '@/models/app-data';
import type { EffectiveDay } from '@/services/app-data-service';
import type { PayrollCalendarEntry } from '@/services/payroll-schedule';
import type { CalendarLayout } from '@/utils/calendar-layout';
import type { CalendarCell } from '@/utils/date';
import { formatMonthTitle } from '@/utils/date';
import type { KoreanHolidayInfo } from '@/utils/korean-holiday';
import {
  CalendarDayCell,
  createCalendarDayCellStyles,
} from './calendar-day-cell';
import { CalendarWeekList } from './calendar-week-list';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  canGoNextMonth?: boolean;
  canGoPreviousMonth?: boolean;
  calendarLayout: CalendarLayout;
  cellRows: readonly (readonly CalendarCell[])[];
  effectiveDays: ReadonlyMap<string, EffectiveDay>;
  fontScale: number;
  gridRef: Ref<View>;
  gridViewProps: ViewProps;
  holidays: Readonly<Record<string, KoreanHolidayInfo>>;
  isDark: boolean;
  monthlyWorkdayCount: number;
  notes: AppData['notes'];
  onBeginListSelection?: (dateKey: string) => void;
  onBeginSelection: (dateKey: string) => void;
  onChangeMonth: (amount: number) => void;
  onGridLayout: NonNullable<ViewProps['onLayout']>;
  onPressDate: (dateKey: string) => void;
  onRowLayout: (rowIndex: number, layout: { y: number; height: number }) => void;
  overrides: AppData['overrides'];
  payrollEntries: Readonly<Record<string, PayrollCalendarEntry>>;
  selectedDateKeySet: ReadonlySet<string>;
  selectionMode: boolean;
  simplified: boolean;
  summaryDateKey?: string | null;
  summaryTriggerRef?: Ref<React.ElementRef<typeof Pressable>>;
  swipeViewProps: ViewProps;
  timeOverrides: AppData['timeOverrides'];
  today: string;
  todayBlink: Animated.Value;
  visibleMonth: { year: number; month: number };
};

export const CalendarMonthCard = memo(function CalendarMonthCard({
  canGoNextMonth = true,
  canGoPreviousMonth = true,
  calendarLayout,
  cellRows,
  effectiveDays,
  fontScale,
  gridRef,
  gridViewProps,
  holidays,
  isDark,
  monthlyWorkdayCount,
  notes,
  onBeginListSelection,
  onBeginSelection,
  onChangeMonth,
  onGridLayout,
  onPressDate,
  onRowLayout,
  overrides,
  payrollEntries,
  selectedDateKeySet,
  selectionMode,
  simplified,
  summaryDateKey = null,
  summaryTriggerRef,
  swipeViewProps,
  timeOverrides,
  today,
  todayBlink,
  visibleMonth,
}: Props) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const dayCellStyles = useThemedStyles(createCalendarDayCellStyles);
  const showMonthGrid = calendarLayout.presentation === 'month-grid';
  const calendarGrid = (
    <View style={{ width: calendarLayout.gridWidth }}>
      <CalendarWeekdayHeader palette={palette} styles={styles} />
      <View
        {...gridViewProps}
        ref={gridRef}
        onLayout={onGridLayout}
        style={styles.grid}>
        {cellRows.map((row, rowIndex) => (
          <View
            key={row[0].dateKey}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              onRowLayout(rowIndex, { y, height });
            }}
            style={[
              styles.gridRow,
              rowIndex === cellRows.length - 1 && styles.gridRowLast,
            ]}>
            {row.map((cell, weekdayIndex) => {
              if (!cell.inCurrentMonth) {
                return (
                  <View
                    accessible={false}
                    key={cell.dateKey}
                    style={[
                      dayCellStyles.cellWrapper,
                      weekdayIndex < 6 && dayCellStyles.cellDividerRight,
                    ]}>
                    <View
                      style={[
                        dayCellStyles.cell,
                        dayCellStyles.inactiveCell,
                        { minHeight: calendarLayout.cellMinHeight },
                      ]}
                    />
                  </View>
                );
              }

              const effectiveDay = effectiveDays.get(cell.dateKey)!;
              const hasOverride =
                effectiveDay.scheduleActive &&
                (Object.prototype.hasOwnProperty.call(overrides, cell.dateKey) ||
                  Object.prototype.hasOwnProperty.call(timeOverrides, cell.dateKey));

              return (
                <CalendarDayCell
                  key={cell.dateKey}
                  calendarLayout={calendarLayout}
                  cell={cell}
                  effectiveDay={effectiveDay}
                  elementRef={
                    summaryDateKey === cell.dateKey
                      ? summaryTriggerRef
                      : undefined
                  }
                  fontScale={fontScale}
                  hasNote={Boolean(notes[cell.dateKey])}
                  hasOverride={hasOverride}
                  holiday={holidays[cell.dateKey] ?? null}
                  isDark={isDark}
                  isToday={cell.dateKey === today}
                  onBeginSelection={onBeginSelection}
                  onPressDate={onPressDate}
                  palette={palette}
                  payrollEntry={payrollEntries[cell.dateKey] ?? null}
                  row={row}
                  selectedDateKeySet={selectedDateKeySet}
                  selectionMode={selectionMode}
                  simplified={simplified}
                  styles={dayCellStyles}
                  todayBlink={todayBlink}
                  weekdayIndex={weekdayIndex}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View {...(showMonthGrid ? swipeViewProps : {})}>
      <Card style={styles.card}>
        <View {...(!showMonthGrid ? swipeViewProps : {})}>
          <CalendarMonthHeader
            canGoNextMonth={canGoNextMonth}
            canGoPreviousMonth={canGoPreviousMonth}
            minHeight={calendarLayout.monthHeaderMinHeight}
            monthlyWorkdayCount={monthlyWorkdayCount}
            onChangeMonth={onChangeMonth}
            palette={palette}
            supportsSwipeGesture
            styles={styles}
            visibleMonth={visibleMonth}
          />
        </View>
        {showMonthGrid ? (
          calendarGrid
        ) : (
          <CalendarWeekList
            cellRows={cellRows}
            effectiveDays={effectiveDays}
            fontScale={fontScale}
            holidays={holidays}
            isDark={isDark}
            notes={notes}
            onBeginListSelection={onBeginListSelection}
            onPressDate={onPressDate}
            overrides={overrides}
            payrollEntries={payrollEntries}
            selectedDateKeySet={selectedDateKeySet}
            selectionMode={selectionMode}
            summaryDateKey={summaryDateKey}
            summaryTriggerRef={summaryTriggerRef}
            timeOverrides={timeOverrides}
            today={today}
            todayBlink={todayBlink}
          />
        )}
      </Card>
    </View>
  );
});

type CalendarStyles = ReturnType<typeof createStyles>;

function CalendarMonthHeader({
  canGoNextMonth,
  canGoPreviousMonth,
  minHeight,
  monthlyWorkdayCount,
  onChangeMonth,
  palette,
  supportsSwipeGesture,
  styles,
  visibleMonth,
}: {
  canGoNextMonth: boolean;
  canGoPreviousMonth: boolean;
  minHeight: number;
  monthlyWorkdayCount: number;
  onChangeMonth: (amount: number) => void;
  palette: AppPalette;
  supportsSwipeGesture: boolean;
  styles: CalendarStyles;
  visibleMonth: { year: number; month: number };
}) {
  const monthTitle = formatMonthTitle(visibleMonth.year, visibleMonth.month);

  return (
    <View style={[styles.monthHeader, { minHeight }]}>
      <Pressable
        accessibilityLabel="이전 달 보기"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canGoPreviousMonth }}
        disabled={!canGoPreviousMonth}
        hitSlop={8}
        onPress={() => onChangeMonth(-1)}
        style={({ pressed }) => [
          styles.navButton,
          !canGoPreviousMonth && styles.navButtonDisabled,
          pressed && canGoPreviousMonth && styles.pressed,
        ]}>
        <AppIcon
          color={canGoPreviousMonth ? palette.indigoDark : palette.disabledInk}
          name="chevron-back"
          size={20}
        />
      </Pressable>
      <View
        accessible
        accessibilityHint={
          supportsSwipeGesture
            ? '달력을 왼쪽이나 오른쪽으로 밀어 월을 이동할 수 있습니다.'
            : '화살표로 이전 달이나 다음 달로 이동할 수 있습니다.'
        }
        accessibilityLabel={`${monthTitle}, ${monthlyWorkdayCount}일 근무`}
        style={styles.monthCopy}>
        <AppText accessibilityRole="header" maxFontSizeMultiplier={2} variant="heading">
          {monthTitle}
        </AppText>
        <View style={styles.monthSummaryPill}>
          <View style={styles.monthSummaryDot} />
          <AppText
            color={palette.mintDark}
            maxFontSizeMultiplier={1.6}
            style={styles.monthSummaryText}
            variant="caption">
            {monthlyWorkdayCount}일 근무
          </AppText>
        </View>
      </View>
      <Pressable
        accessibilityLabel="다음 달 보기"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canGoNextMonth }}
        disabled={!canGoNextMonth}
        hitSlop={8}
        onPress={() => onChangeMonth(1)}
        style={({ pressed }) => [
          styles.navButton,
          !canGoNextMonth && styles.navButtonDisabled,
          pressed && canGoNextMonth && styles.pressed,
        ]}>
        <AppIcon
          color={canGoNextMonth ? palette.indigoDark : palette.disabledInk}
          name="chevron-forward"
          size={20}
        />
      </Pressable>
    </View>
  );
}

function CalendarWeekdayHeader({
  palette,
  styles,
}: {
  palette: AppPalette;
  styles: CalendarStyles;
}) {
  return (
    <View style={styles.weekdayRow}>
      {WEEKDAYS.map((weekday, index) => (
        <View
          key={weekday}
          style={[
            styles.weekdayCell,
            index < 6 && styles.weekdayCellDivider,
          ]}>
          <AppText
            color={index === 0 ? palette.coral : index === 6 ? palette.weekendSaturday : palette.inkMuted}
            maxFontSizeMultiplier={2}
            style={styles.weekdayText}
            variant="caption">
            {weekday}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: {
      padding: 0,
      overflow: 'hidden',
      borderRadius: 20,
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.medium,
      paddingVertical: 10,
      backgroundColor: palette.indigoSoft,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    monthCopy: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.tiny,
    },
    monthSummaryPill: {
      minHeight: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      borderRadius: radii.pill,
      backgroundColor: palette.mintSoft,
    },
    monthSummaryDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: palette.mint,
    },
    monthSummaryText: {
      fontFamily: fontFamily.label,
      fontSize: 11.5,
      lineHeight: 16,
    },
    navButton: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surface,
    },
    navButtonDisabled: { backgroundColor: palette.disabledSurface },
    weekdayRow: {
      flexDirection: 'row',
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.controlLine,
    },
    weekdayCell: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      paddingVertical: 10,
    },
    weekdayCellDivider: {
      borderRightWidth: 1,
      borderRightColor: palette.line,
    },
    weekdayText: {
      fontFamily: fontFamily.label,
      fontSize: 14,
      lineHeight: 19,
    },
    grid: { backgroundColor: palette.surface },
    gridRow: {
      width: '100%',
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: palette.controlLine,
    },
    gridRowLast: { borderBottomWidth: 0 },
    pressed: { opacity: 0.66, transform: [{ scale: 0.97 }] },
  });
}
