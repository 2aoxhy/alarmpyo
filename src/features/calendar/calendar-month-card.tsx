import type { Ref } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppText, Card } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
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

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
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
  swipeViewProps: ViewProps;
  timeOverrides: AppData['timeOverrides'];
  today: string;
  todayBlink: Animated.Value;
  visibleMonth: { year: number; month: number };
};

export function CalendarMonthCard({
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
  swipeViewProps,
  timeOverrides,
  today,
  todayBlink,
  visibleMonth,
}: Props) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const dayCellStyles = useThemedStyles(createCalendarDayCellStyles);
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
                  fontScale={fontScale}
                  hasNote={Boolean(notes[cell.dateKey])}
                  hasOverride={hasOverride}
                  holiday={holidays[cell.dateKey] ?? null}
                  isDark={isDark}
                  onBeginSelection={onBeginSelection}
                  onPressDate={onPressDate}
                  palette={palette}
                  payrollEntry={payrollEntries[cell.dateKey] ?? null}
                  row={row}
                  selectedDateKeySet={selectedDateKeySet}
                  selectionMode={selectionMode}
                  simplified={simplified}
                  styles={dayCellStyles}
                  today={today}
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
    <View {...(calendarLayout.needsHorizontalScroll ? {} : swipeViewProps)}>
      <Card style={styles.card}>
        <CalendarMonthHeader
          minHeight={calendarLayout.monthHeaderMinHeight}
          monthlyWorkdayCount={monthlyWorkdayCount}
          onChangeMonth={onChangeMonth}
          palette={palette}
          supportsSwipeGesture={!calendarLayout.needsHorizontalScroll}
          styles={styles}
          visibleMonth={visibleMonth}
        />
        {calendarLayout.needsHorizontalScroll ? (
          <>
            <View
              accessible
              accessibilityLabel="날짜 영역을 좌우로 밀어 일주일을 확인해요."
              style={styles.horizontalScrollHint}>
              <AppIcon
                accessible={false}
                color={palette.inkMuted}
                name="swap-horizontal"
                size={17}
              />
              <AppText color={palette.inkMuted} variant="caption">
                날짜 영역을 좌우로 밀어 보세요
              </AppText>
            </View>
            <ScrollView
              accessibilityHint="좌우로 밀어 가려진 날짜를 확인해요."
              accessibilityLabel="월간 달력 날짜 영역"
              directionalLockEnabled
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator>
              {calendarGrid}
            </ScrollView>
          </>
        ) : (
          calendarGrid
        )}
      </Card>
    </View>
  );
}

type CalendarStyles = ReturnType<typeof createStyles>;

function CalendarMonthHeader({
  minHeight,
  monthlyWorkdayCount,
  onChangeMonth,
  palette,
  supportsSwipeGesture,
  styles,
  visibleMonth,
}: {
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
        hitSlop={8}
        onPress={() => onChangeMonth(-1)}
        style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}>
        <AppIcon color={palette.violet} name="chevron-back" size={20} />
      </Pressable>
      <View
        accessible
        accessibilityHint={
          supportsSwipeGesture
            ? '달력을 왼쪽이나 오른쪽으로 밀어 월을 이동할 수 있어요.'
            : '화살표로 월을 이동하고 날짜 영역을 좌우로 밀어 일주일을 확인할 수 있어요.'
        }
        accessibilityLabel={`${monthTitle}, ${monthlyWorkdayCount}일 근무 예정`}
        accessibilityLiveRegion="polite"
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
            {monthlyWorkdayCount}일 근무 예정
          </AppText>
        </View>
      </View>
      <Pressable
        accessibilityLabel="다음 달 보기"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => onChangeMonth(1)}
        style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}>
        <AppIcon color={palette.violet} name="chevron-forward" size={20} />
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
            color={index === 0 ? palette.coral : index === 6 ? palette.violet : palette.inkMuted}
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
    horizontalScrollHint: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
      backgroundColor: palette.surfaceSoft,
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
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surface,
    },
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
