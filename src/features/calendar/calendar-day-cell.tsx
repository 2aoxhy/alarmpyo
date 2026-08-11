import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import {
  AnimatedShiftIcon,
  getShiftIconKind,
} from '@/components/animated-shift-icon';
import { AppText } from '@/components/ui-kit';
import type { AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import type { EffectiveDay } from '@/services/app-data-service';
import type { PayrollCalendarEntry } from '@/services/payroll-schedule';
import type { CalendarLayout } from '@/utils/calendar-layout';
import {
  resolveCalendarSelectionSegment,
} from '@/utils/calendar-selection';
import type { CalendarCell } from '@/utils/date';
import { formatKoreanDate } from '@/utils/date';
import {
  getDayExceptionAppearance,
} from '@/utils/day-exception-appearance';
import { getDayExceptionLabel } from '@/utils/day-exception';
import type { KoreanHolidayInfo } from '@/utils/korean-holiday';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  resolveCalendarExceptionBadgeDisplay,
  resolveCalendarStatusDisplay,
} from './calendar-day-status';

export type CalendarDayCellStyles = ReturnType<
  typeof createCalendarDayCellStyles
>;

type Props = {
  calendarLayout: CalendarLayout;
  cell: CalendarCell;
  effectiveDay: EffectiveDay;
  fontScale: number;
  hasNote: boolean;
  hasOverride: boolean;
  holiday: KoreanHolidayInfo | null;
  isDark: boolean;
  onBeginSelection: (dateKey: string) => void;
  onPressDate: (dateKey: string) => void;
  palette: AppPalette;
  payrollEntry: PayrollCalendarEntry | null;
  row: readonly CalendarCell[];
  selectedDateKeySet: ReadonlySet<string>;
  selectionMode: boolean;
  simplified: boolean;
  styles: CalendarDayCellStyles;
  today: string;
  todayBlink: Animated.Value;
  weekdayIndex: number;
};

export function CalendarDayCell({
  calendarLayout,
  cell,
  effectiveDay,
  fontScale,
  hasNote,
  hasOverride,
  holiday,
  isDark,
  onBeginSelection,
  onPressDate,
  palette,
  payrollEntry,
  row,
  selectedDateKeySet,
  selectionMode,
  simplified,
  styles,
  today,
  todayBlink,
  weekdayIndex,
}: Props) {
  const shift = effectiveDay.shift;
  const shiftAppearance = shift
    ? getShiftAppearance(shift, palette, isDark)
    : null;
  const isToday = cell.dateKey === today;
  const isSelected = selectedDateKeySet.has(cell.dateKey);
  const selectionSegment = resolveCalendarSelectionSegment(
    row,
    weekdayIndex,
    selectedDateKeySet,
  );
  const scheduleDate = effectiveDay.scheduleActive;
  const dayException = effectiveDay.dayException;
  const dayExceptionLabel = dayException
    ? getDayExceptionLabel(dayException)
    : null;
  const exceptionAppearance = dayException
    ? getDayExceptionAppearance(dayException, palette)
    : null;
  const compact = simplified || calendarLayout.badgeUsesCompactLabel;
  const exceptionBadgeDisplay = dayException
    ? resolveCalendarExceptionBadgeDisplay(dayException, compact)
    : null;
  const statusDisplay = resolveCalendarStatusDisplay(
    holiday,
    payrollEntry,
    compact,
  );
  const badgeMaxWidth = Math.max(calendarLayout.cellWidth - 8, 32);
  const calendarTextScale = compact ? 1.35 : 1.7;
  const statusTextScale = compact ? 1.25 : 1.5;

  return (
    <Pressable
      accessibilityHint={
        scheduleDate && selectionMode
          ? '선택 목록에 추가하거나 선택을 해제해요.'
          : scheduleDate
            ? '짧게 누르면 하루 일정을 편집해요. 길게 누르면 변경하거나 공유할 날짜를 선택해요.'
            : '일정 적용 시작일 이후 날짜만 편집할 수 있어요.'
      }
      accessibilityLabel={`${formatKoreanDate(cell.dateKey, true)}${isToday ? ', 오늘' : ''}${holiday ? `, ${holiday.accessibilityLabel}` : ''}${payrollEntry ? `, ${payrollEntry.accessibilityLabel}` : ''}, ${scheduleDate ? shift?.name ?? '일정 없음' : '일정 적용 시작일 이전 날짜'}${dayExceptionLabel ? `, 예외 일정 ${dayExceptionLabel}` : ''}${hasNote ? ', 메모 있음' : ''}${hasOverride ? ', 직접 변경한 날' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !scheduleDate, selected: isSelected }}
      accessibilityActions={
        scheduleDate
          ? [{ name: 'longpress', label: '변경하거나 공유할 날짜로 선택하기' }]
          : undefined
      }
      delayLongPress={360}
      disabled={!scheduleDate}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') {
          onBeginSelection(cell.dateKey);
        }
      }}
      onLongPress={() => onBeginSelection(cell.dateKey)}
      onPress={() => onPressDate(cell.dateKey)}
      style={({ pressed }) => [
        styles.cellWrapper,
        weekdayIndex < 6 &&
          selectionSegment !== 'start' &&
          selectionSegment !== 'middle' &&
          styles.cellDividerRight,
        isSelected && styles.selectedCellWrapper,
        (selectionSegment === 'middle' || selectionSegment === 'end') &&
          styles.selectedCellWrapperJoinedLeft,
        (selectionSegment === 'start' || selectionSegment === 'middle') &&
          styles.selectedCellWrapperJoinedRight,
        pressed &&
          (isSelected ? styles.selectedCellPressed : styles.cellPressed),
      ]}>
      <Animated.View
        style={[
          styles.cell,
          { minHeight: calendarLayout.cellMinHeight },
          !scheduleDate && styles.inactiveCell,
          isToday && !isSelected && styles.todayCell,
          isSelected && styles.selectedCellBase,
          selectionSegment === 'single' && styles.selectedCellSingle,
          selectionSegment === 'start' && styles.selectedCellStart,
          selectionSegment === 'middle' && styles.selectedCellMiddle,
          selectionSegment === 'end' && styles.selectedCellEnd,
          isToday && { opacity: todayBlink },
        ]}>
        <View style={styles.dayHeader}>
          <View
            style={[
              styles.dayNumber,
              {
                minHeight: calendarLayout.dayBadgeSize,
                minWidth: calendarLayout.dayBadgeSize,
              },
              isToday && styles.todayDayNumber,
              isSelected && !isToday && styles.selectedDayNumber,
            ]}>
            <AppText
              color={
                isToday
                  ? isDark
                    ? palette.canvas
                    : palette.white
                  : isSelected
                    ? palette.white
                    : holiday || weekdayIndex === 0
                      ? palette.coral
                      : weekdayIndex === 6
                        ? palette.violet
                        : palette.ink
              }
              maxFontSizeMultiplier={2}
              style={styles.dayNumberText}
              variant="caption">
              {cell.day}
            </AppText>
          </View>
          {hasNote ? <View style={styles.noteDot} /> : null}
        </View>

        {simplified ? (
          <>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.simpleStatusRow}>
              {holiday ? <View style={styles.simpleHolidayMark} /> : null}
              {payrollEntry ? <View style={styles.simplePaydayMark} /> : null}
            </View>
            <View style={styles.simpleShiftSlot}>
              {shift || dayExceptionLabel ? (
                <View
                  style={[
                    styles.simpleShiftBadge,
                    {
                      backgroundColor:
                        exceptionAppearance?.softColor ?? shiftAppearance!.softColor,
                    },
                  ]}>
                  {dayExceptionLabel ? (
                    <AppIcon
                      accessible={false}
                      color={exceptionAppearance!.accentColor}
                      name={exceptionAppearance!.iconName}
                      size={13}
                    />
                  ) : (
                    <AnimatedShiftIcon
                      animated={false}
                      color={shiftAppearance!.accentColor}
                      kind={getShiftIconKind(shift!.id, shift!.isOff)}
                      size={13}
                    />
                  )}
                  <AppText
                    color={exceptionAppearance?.accentColor ?? shiftAppearance!.accentColor}
                    maxFontSizeMultiplier={1.25}
                    numberOfLines={1}
                    style={styles.simpleShiftText}
                    variant="caption">
                    {dayException
                      ? exceptionBadgeDisplay?.label
                      : shift!.shortName}
                  </AppText>
                </View>
              ) : scheduleDate ? (
                <AppText color={palette.inkSoft} variant="caption">
                  —
                </AppText>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <View
              style={[
                styles.calendarStatusSlot,
                { minHeight: fontScale >= 1.4 ? 28 : 22 },
              ]}>
          {statusDisplay.primary?.kind === 'holiday' ? (
            <View style={[styles.holidayBadge, { maxWidth: badgeMaxWidth }]}>
              <AppText
                color={palette.coral}
                maxFontSizeMultiplier={statusTextScale}
                numberOfLines={1}
                style={styles.calendarStatusText}
                variant="caption">
                {statusDisplay.primary.label}
              </AppText>
            </View>
          ) : statusDisplay.primary?.kind === 'payday' ? (
            <View style={[styles.paydayBadge, { maxWidth: badgeMaxWidth }]}>
              <AppText
                color={palette.amber}
                maxFontSizeMultiplier={statusTextScale}
                numberOfLines={1}
                style={styles.calendarStatusText}
                variant="caption">
                {statusDisplay.primary.label}
              </AppText>
            </View>
          ) : null}
          {statusDisplay.showPaydayDot ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.paydayDot}
            />
          ) : null}
            </View>

            <View
              style={[
                styles.shiftSlot,
                { minHeight: fontScale >= 1.4 ? 31 : 24 },
              ]}>
          {shift || dayExceptionLabel ? (
            <View
              style={[
                styles.shiftBadge,
                compact && styles.shiftBadgeCompact,
                dayException && styles.exceptionBadge,
                { maxWidth: badgeMaxWidth },
                {
                  backgroundColor:
                    exceptionAppearance?.softColor ?? shiftAppearance!.softColor,
                },
              ]}>
              {dayExceptionLabel ? (
                <>
                  {exceptionBadgeDisplay?.showIcon ? (
                    <AppIcon
                      color={exceptionAppearance!.accentColor}
                      name={exceptionAppearance!.iconName}
                      size={13}
                    />
                  ) : null}
                  <AppText
                    color={exceptionAppearance!.accentColor}
                    maxFontSizeMultiplier={calendarTextScale}
                    numberOfLines={1}
                    style={styles.exceptionBadgeText}
                    variant="caption">
                    {exceptionBadgeDisplay?.label}
                  </AppText>
                </>
              ) : shift!.id.startsWith('substitute-') ? (
                <AppText
                  color={shiftAppearance!.accentColor}
                  maxFontSizeMultiplier={calendarTextScale}
                  numberOfLines={1}
                  style={styles.substituteBadgeText}
                  variant="caption">
                  {shift!.shortName}
                </AppText>
              ) : (
                <>
                  <AnimatedShiftIcon
                    animated={false}
                    color={shiftAppearance!.accentColor}
                    kind={getShiftIconKind(shift!.id, shift!.isOff)}
                    size={13}
                  />
                  <AppText
                    color={shiftAppearance!.accentColor}
                    maxFontSizeMultiplier={calendarTextScale}
                    numberOfLines={1}
                    style={styles.shiftBadgeText}
                    variant="caption">
                    {shift!.shortName}
                  </AppText>
                </>
              )}
            </View>
          ) : scheduleDate ? (
            <AppText color={palette.inkSoft} variant="caption">
              —
            </AppText>
          ) : null}
            </View>
          </>
        )}
        {hasOverride ? <View style={styles.overrideMark} /> : null}
      </Animated.View>
    </Pressable>
  );
}

export function createCalendarDayCellStyles(palette: AppPalette) {
  return StyleSheet.create({
    cellWrapper: {
      flex: 1,
      minWidth: 0,
      padding: 0,
    },
    cellDividerRight: {
      borderRightWidth: 1,
      borderRightColor: palette.controlLine,
    },
    selectedCellWrapper: { paddingVertical: 0, zIndex: 1 },
    selectedCellWrapperJoinedLeft: { paddingLeft: 0 },
    selectedCellWrapperJoinedRight: { paddingRight: 0 },
    cell: {
      paddingHorizontal: 2,
      paddingVertical: 5,
      borderRadius: 0,
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 2,
      backgroundColor: palette.surface,
    },
    todayCell: { backgroundColor: palette.mintSoft },
    selectedCellBase: {
      backgroundColor: palette.indigoSoft,
      borderTopWidth: 2,
      borderBottomWidth: 2,
      borderLeftWidth: 0,
      borderRightWidth: 0,
      borderColor: palette.indigo,
      borderRadius: 0,
    },
    selectedCellSingle: {
      borderLeftWidth: 2,
      borderRightWidth: 2,
      borderRadius: 10,
    },
    selectedCellStart: {
      borderLeftWidth: 2,
      borderTopLeftRadius: 10,
      borderBottomLeftRadius: 10,
    },
    selectedCellMiddle: { borderLeftWidth: 0, borderRightWidth: 0 },
    selectedCellEnd: {
      borderRightWidth: 2,
      borderTopRightRadius: 10,
      borderBottomRightRadius: 10,
    },
    inactiveCell: { opacity: 0.38, backgroundColor: palette.surfaceSoft },
    dayHeader: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dayNumber: {
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayNumberText: {
      fontFamily: fontFamily.label,
      fontSize: 16,
      lineHeight: 21,
      fontVariant: ['tabular-nums'],
    },
    todayDayNumber: { backgroundColor: palette.mint },
    selectedDayNumber: { backgroundColor: palette.indigo },
    noteDot: {
      position: 'absolute',
      right: 3,
      top: 2,
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: palette.coral,
    },
    calendarStatusSlot: {
      width: '100%',
      minHeight: 22,
      paddingHorizontal: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      overflow: 'hidden',
    },
    simpleStatusRow: {
      minHeight: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    simpleHolidayMark: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.coral,
    },
    simplePaydayMark: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.amber,
    },
    simpleShiftSlot: {
      minHeight: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    simpleShiftBadge: {
      minWidth: 40,
      minHeight: 32,
      paddingHorizontal: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderRadius: 11,
    },
    simpleShiftText: {
      fontFamily: fontFamily.label,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'center',
    },
    holidayBadge: {
      maxWidth: '100%',
      flexShrink: 1,
      minHeight: 17,
      borderRadius: 7,
      paddingHorizontal: 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.coralSoft,
    },
    paydayBadge: {
      maxWidth: '100%',
      flexShrink: 1,
      minHeight: 17,
      borderRadius: 7,
      paddingHorizontal: 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.amberSoft,
    },
    paydayDot: {
      position: 'absolute',
      right: 1,
      top: 1,
      width: 5,
      height: 5,
      flexShrink: 0,
      borderRadius: 3,
      backgroundColor: palette.amber,
    },
    calendarStatusText: {
      fontFamily: fontFamily.label,
      fontSize: 10.5,
      lineHeight: 14,
      letterSpacing: -0.2,
      textAlign: 'center',
    },
    shiftSlot: {
      width: '100%',
      minHeight: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shiftBadge: {
      width: '100%',
      maxWidth: 50,
      minHeight: 25,
      borderRadius: 9,
      paddingHorizontal: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    shiftBadgeCompact: { paddingHorizontal: 2 },
    exceptionBadge: { gap: 2, paddingHorizontal: 3 },
    shiftBadgeText: {
      fontFamily: fontFamily.label,
      fontSize: 12.5,
      lineHeight: 17,
      textAlign: 'center',
    },
    substituteBadgeText: {
      fontFamily: fontFamily.label,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'center',
    },
    exceptionBadgeText: {
      fontFamily: fontFamily.label,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'center',
    },
    overrideMark: {
      position: 'absolute',
      bottom: 2,
      width: 16,
      height: 3,
      borderRadius: 2,
      backgroundColor: palette.mint,
    },
    cellPressed: { opacity: 0.74 },
    selectedCellPressed: { opacity: 0.82 },
  });
}
