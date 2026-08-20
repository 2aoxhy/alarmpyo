import { memo, type Ref } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import {
  AnimatedShiftIcon,
  getShiftIconKind,
} from '@/components/animated-shift-icon';
import { AppText } from '@/components/ui-kit';
import { StatusBadge } from '@/components/status-badge';
import type { AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';
import type { EffectiveDay } from '@/services/app-data-service';
import { resolveCalendarDayViewModel } from '@/services/calendar-month-view-model';
import type { PayrollCalendarEntry } from '@/services/payroll-schedule';
import type { CalendarLayout } from '@/utils/calendar-layout';
import {
  resolveCalendarSelectionSegment,
} from '@/utils/calendar-selection';
import type { CalendarCell } from '@/utils/date';
import {
  getDayExceptionAppearance,
} from '@/utils/day-exception-appearance';
import { getDayExceptionLabel } from '@/utils/day-exception';
import type { KoreanHolidayInfo } from '@/utils/korean-holiday';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  type CalendarDateMarker,
  resolveCalendarExceptionBadgeDisplay,
  resolveCalendarStatusDisplay,
} from './calendar-day-status';
import {
  buildCalendarDayAccessibilityLabel,
  isCalendarDayInteractionDisabled,
} from './calendar-day-presentation';

export type CalendarDayCellStyles = ReturnType<
  typeof createCalendarDayCellStyles
>;

type Props = {
  calendarLayout: CalendarLayout;
  cell: CalendarCell;
  effectiveDay: EffectiveDay;
  elementRef?: Ref<React.ElementRef<typeof Pressable>>;
  fontScale: number;
  hasNote: boolean;
  hasOverride: boolean;
  holiday: KoreanHolidayInfo | null;
  isDark: boolean;
  isToday: boolean;
  onBeginSelection: (dateKey: string) => void;
  onPressDate: (dateKey: string) => void;
  palette: AppPalette;
  payrollEntry: PayrollCalendarEntry | null;
  row: readonly CalendarCell[];
  selectedDateKeySet: ReadonlySet<string>;
  selectionMode: boolean;
  simplified: boolean;
  styles: CalendarDayCellStyles;
  todayBlink: Animated.Value;
  weekdayIndex: number;
};

export const CalendarDayCell = memo(function CalendarDayCell({
  calendarLayout,
  cell,
  effectiveDay,
  elementRef,
  fontScale,
  hasNote,
  hasOverride,
  holiday,
  isDark,
  isToday,
  onBeginSelection,
  onPressDate,
  palette,
  payrollEntry,
  row,
  selectedDateKeySet,
  selectionMode,
  simplified,
  styles,
  todayBlink,
  weekdayIndex,
}: Props) {
  const cellFocus = useWebFocusVisible();
  const shift = effectiveDay.shift;
  const shiftAppearance = shift
    ? getShiftAppearance(shift, palette, isDark)
    : null;
  const isSelected = selectedDateKeySet.has(cell.dateKey);
  const selectionSegment = resolveCalendarSelectionSegment(
    row,
    weekdayIndex,
    selectedDateKeySet,
  );
  const scheduleDate = effectiveDay.scheduleActive;
  const interactionDisabled = isCalendarDayInteractionDisabled(
    scheduleDate,
    selectionMode,
  );
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
  const accessibilityLabel = buildCalendarDayAccessibilityLabel(
    resolveCalendarDayViewModel({
      cell,
      effectiveDay,
      hasDirectScheduleOverride: hasOverride,
      hasNote,
      holiday,
      payrollEntry,
    }),
    { isToday },
  );

  return (
    <Pressable
      accessibilityHint={
        scheduleDate && selectionMode
          ? '선택 목록에 추가하거나 선택을 해제합니다.'
          : !selectionMode && scheduleDate
            ? '누르면 날짜 요약을 엽니다. 길게 누르면 변경하거나 공유할 날짜를 선택합니다.'
            : !selectionMode
              ? '누르면 날짜 요약을 엽니다.'
            : '일정 적용 시작일 이후 날짜만 편집할 수 있습니다.'
      }
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={selectionMode ? 'checkbox' : 'button'}
      accessibilityState={
        selectionMode
          ? { checked: isSelected, disabled: !scheduleDate }
          : undefined
      }
      accessibilityActions={
        scheduleDate
          ? [{ name: 'longpress', label: '변경하거나 공유할 날짜로 선택하기' }]
          : undefined
      }
      delayLongPress={360}
      disabled={interactionDisabled}
      ref={elementRef}
      onBlur={cellFocus.onBlur}
      onFocus={cellFocus.onFocus}
      onAccessibilityAction={(event) => {
        if (
          event.nativeEvent.actionName === 'longpress' &&
          scheduleDate
        ) {
          onBeginSelection(cell.dateKey);
        }
      }}
      onLongPress={
        scheduleDate ? () => onBeginSelection(cell.dateKey) : undefined
      }
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
        cellFocus.focusVisible && !interactionDisabled && styles.cellFocusVisible,
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
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.dayIndicatorRow}>
          {isSelected ? (
            <View style={styles.selectedCheck}>
              <AppIcon
                accessible={false}
                color={palette.canvas}
                name="checkmark"
                size={10}
                strokeWidth={2.6}
              />
            </View>
          ) : <View style={styles.indicatorPlaceholder} />}
          {hasNote ? <View style={styles.noteDot} /> : null}
        </View>
        <View style={styles.dayHeader}>
          <View
            style={[
              styles.dayNumber,
              {
                minHeight: calendarLayout.dayBadgeSize,
                minWidth: calendarLayout.dayBadgeSize,
              },
              isToday && styles.todayDayNumber,
            ]}>
            <AppText
              color={
                isToday
                  ? isDark
                    ? palette.canvas
                    : palette.white
                  : isSelected
                    ? palette.white
                    : !scheduleDate
                      ? palette.disabledInk
                    : holiday || weekdayIndex === 0
                      ? palette.coral
                      : weekdayIndex === 6
                        ? palette.weekendSaturday
                        : palette.ink
              }
              maxFontSizeMultiplier={2}
              style={styles.dayNumberText}
              variant="caption">
              {cell.day}
            </AppText>
          </View>
        </View>

        {simplified ? (
          <>
            <CalendarDateMetadataMarkers
              compact
              markers={statusDisplay.markers}
              palette={palette}
              styles={styles}
            />
            <View style={styles.simpleShiftSlot}>
              {shift || dayExceptionLabel ? (
                <StatusBadge
                  backgroundColor={
                    exceptionAppearance?.softColor ??
                    (shift?.id.startsWith('substitute-')
                      ? palette.surfaceSoft
                      : shiftAppearance!.softColor)
                  }
                  borderColor={
                    !dayException && shift?.id.startsWith('substitute-')
                      ? shiftAppearance!.accentColor
                      : undefined
                  }
                  icon={
                    dayExceptionLabel ? (
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
                    )
                  }
                  label={
                    dayException
                      ? exceptionBadgeDisplay?.label ?? ''
                      : shift!.shortName
                  }
                  maxFontSizeMultiplier={1.25}
                  size="calendar"
                  style={styles.simpleShiftBadge}
                />
              ) : scheduleDate ? (
                <AppText tone="tertiary" variant="caption">
                  —
                </AppText>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <CalendarDateMetadataMarkers
              markers={statusDisplay.markers}
              palette={palette}
              styles={styles}
            />

            <View
              style={[
                styles.shiftSlot,
                { minHeight: fontScale >= 1.4 ? 31 : 24 },
              ]}>
              {shift || dayExceptionLabel ? (
                <StatusBadge
                  backgroundColor={
                    exceptionAppearance?.softColor ??
                    (shift?.id.startsWith('substitute-')
                      ? palette.surfaceSoft
                      : shiftAppearance!.softColor)
                  }
                  borderColor={
                    !dayException && shift?.id.startsWith('substitute-')
                      ? shiftAppearance!.accentColor
                      : undefined
                  }
                  icon={
                    dayExceptionLabel ? (
                      exceptionBadgeDisplay?.showIcon ? (
                        <AppIcon
                          color={exceptionAppearance!.accentColor}
                          name={exceptionAppearance!.iconName}
                          size={13}
                        />
                      ) : null
                    ) : (
                      <AnimatedShiftIcon
                        animated={false}
                        color={shiftAppearance!.accentColor}
                        kind={getShiftIconKind(shift!.id, shift!.isOff)}
                        size={13}
                      />
                    )
                  }
                  label={
                    dayException
                      ? exceptionBadgeDisplay?.label ?? ''
                      : shift!.shortName
                  }
                  maxFontSizeMultiplier={calendarTextScale}
                  maxWidth={badgeMaxWidth}
                  size="calendar"
                  style={[
                    styles.shiftBadge,
                    compact && styles.shiftBadgeCompact,
                    dayException && styles.exceptionBadge,
                  ]}
                />
              ) : scheduleDate ? (
                <AppText tone="tertiary" variant="caption">
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
}, areCalendarDayCellPropsEqual);

function CalendarDateMetadataMarkers({
  compact = false,
  markers,
  palette,
  styles,
}: {
  compact?: boolean;
  markers: readonly CalendarDateMarker[];
  palette: AppPalette;
  styles: CalendarDayCellStyles;
}) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.calendarMetadataRow,
        compact && styles.calendarMetadataRowCompact,
      ]}>
      {markers.map((marker) => (
        <View
          accessible={false}
          key={marker.kind}
          style={[
            styles.calendarMetadataMarker,
            marker.kind === 'holiday'
              ? styles.holidayMetadataMarker
              : styles.paydayMetadataMarker,
          ]}>
          <AppText
            color={palette.canvas}
            maxFontSizeMultiplier={1.25}
            style={[
              styles.calendarMetadataMarkerText,
              marker.kind === 'payday' &&
                marker.estimated &&
                styles.calendarMetadataMarkerTextCompact,
            ]}
            variant="caption">
            {marker.token}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function areCalendarDayCellPropsEqual(previous: Props, next: Props): boolean {
  const selectionUnchanged =
    previous.selectedDateKeySet === next.selectedDateKeySet ||
    (previous.selectedDateKeySet.has(previous.cell.dateKey) ===
      next.selectedDateKeySet.has(next.cell.dateKey) &&
      resolveCalendarSelectionSegment(
        previous.row,
        previous.weekdayIndex,
        previous.selectedDateKeySet,
      ) ===
        resolveCalendarSelectionSegment(
          next.row,
          next.weekdayIndex,
          next.selectedDateKeySet,
        ));

  return (
    selectionUnchanged &&
    previous.calendarLayout === next.calendarLayout &&
    previous.cell === next.cell &&
    previous.effectiveDay === next.effectiveDay &&
    previous.elementRef === next.elementRef &&
    previous.fontScale === next.fontScale &&
    previous.hasNote === next.hasNote &&
    previous.hasOverride === next.hasOverride &&
    previous.holiday === next.holiday &&
    previous.isDark === next.isDark &&
    previous.isToday === next.isToday &&
    previous.onBeginSelection === next.onBeginSelection &&
    previous.onPressDate === next.onPressDate &&
    previous.palette === next.palette &&
    previous.payrollEntry === next.payrollEntry &&
    previous.row === next.row &&
    previous.selectionMode === next.selectionMode &&
    previous.simplified === next.simplified &&
    previous.styles === next.styles &&
    previous.todayBlink === next.todayBlink &&
    previous.weekdayIndex === next.weekdayIndex
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
      borderColor: palette.selectionBorder,
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
    inactiveCell: { backgroundColor: palette.surfaceSoft },
    dayHeader: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dayIndicatorRow: {
      width: '100%',
      height: 16,
      paddingHorizontal: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    selectedCheck: {
      width: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.selectionBorder,
      backgroundColor: palette.white,
    },
    indicatorPlaceholder: { width: 16, height: 16 },
    noteDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: palette.coral,
    },
    calendarMetadataRow: {
      width: '100%',
      minHeight: 22,
      paddingHorizontal: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      overflow: 'hidden',
    },
    calendarMetadataRowCompact: { minHeight: 20 },
    calendarMetadataMarker: {
      width: 16,
      height: 16,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    holidayMetadataMarker: {
      borderRadius: 4,
      backgroundColor: palette.coral,
    },
    paydayMetadataMarker: {
      borderRadius: 8,
      backgroundColor: palette.amber,
    },
    calendarMetadataMarkerText: {
      fontFamily: fontFamily.label,
      fontSize: 9,
      lineHeight: 12,
      letterSpacing: -0.4,
      textAlign: 'center',
    },
    calendarMetadataMarkerTextCompact: {
      fontSize: 7,
      lineHeight: 10,
      letterSpacing: -0.7,
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
      borderRadius: 11,
    },
    shiftSlot: {
      width: '100%',
      minHeight: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shiftBadge: {
      width: '100%',
      minHeight: 25,
      borderRadius: 9,
      paddingHorizontal: 4,
    },
    shiftBadgeCompact: { paddingHorizontal: 2 },
    exceptionBadge: { gap: 2, paddingHorizontal: 3 },
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
    cellFocusVisible:
      Platform.OS === 'web'
        ? {
            zIndex: 3,
            outlineColor: palette.focus,
            outlineOffset: -2,
            outlineStyle: 'solid',
            outlineWidth: 2,
          }
        : {},
  });
}
