import { useRef, type Ref } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import {
  AnimatedShiftIcon,
  getShiftIconKind,
} from '@/components/animated-shift-icon';
import { AppText } from '@/components/ui-kit';
import type { AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';
import type { AppData } from '@/models/app-data';
import type { EffectiveDay } from '@/services/app-data-service';
import { resolveCalendarDayViewModel } from '@/services/calendar-month-view-model';
import type { PayrollCalendarEntry } from '@/services/payroll-schedule';
import {
  buildCalendarWeekListMetadata,
  buildCalendarWeekListGroups,
  formatCalendarWeekListTime,
  type CalendarWeekListMetadataItem,
} from '@/utils/calendar-layout';
import type { CalendarCell } from '@/utils/date';
import { getDayExceptionLabel } from '@/utils/day-exception';
import { getDayExceptionAppearance } from '@/utils/day-exception-appearance';
import type { KoreanHolidayInfo } from '@/utils/korean-holiday';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  buildCalendarDayAccessibilityLabel,
  isCalendarDayInteractionDisabled,
} from './calendar-day-presentation';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

type Props = {
  cellRows: readonly (readonly CalendarCell[])[];
  effectiveDays: ReadonlyMap<string, EffectiveDay>;
  fontScale: number;
  holidays: Readonly<Record<string, KoreanHolidayInfo>>;
  isDark: boolean;
  notes: AppData['notes'];
  onBeginListSelection?: (dateKey: string) => void;
  onPressDate: (dateKey: string) => void;
  overrides: AppData['overrides'];
  payrollEntries: Readonly<Record<string, PayrollCalendarEntry>>;
  selectedDateKeySet: ReadonlySet<string>;
  selectionMode: boolean;
  summaryDateKey?: string | null;
  summaryTriggerRef?: Ref<React.ElementRef<typeof Pressable>>;
  timeOverrides: AppData['timeOverrides'];
  today: string;
  todayBlink: Animated.Value;
};

export function CalendarWeekList({
  cellRows,
  effectiveDays,
  fontScale,
  holidays,
  isDark,
  notes,
  onBeginListSelection,
  onPressDate,
  overrides,
  payrollEntries,
  selectedDateKeySet,
  selectionMode,
  summaryDateKey = null,
  summaryTriggerRef,
  timeOverrides,
  today,
  todayBlink,
}: Props) {
  const groups = buildCalendarWeekListGroups(cellRows);
  const stacked = fontScale >= 1.4;
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.list}>
      {groups.map((group) => (
        <View key={group.weekNumber} style={styles.weekGroup}>
          <AppText
            accessibilityRole="header"
            style={styles.weekHeader}
            variant="label">
            {group.label}
          </AppText>
          <View style={styles.weekDays}>
            {group.days.map(({ cell, weekdayIndex }) => {
              const effectiveDay = effectiveDays.get(cell.dateKey)!;
              const hasOverride =
                effectiveDay.scheduleActive &&
                (Object.prototype.hasOwnProperty.call(overrides, cell.dateKey) ||
                  Object.prototype.hasOwnProperty.call(timeOverrides, cell.dateKey));

              return (
                <CalendarWeekListRow
                  key={cell.dateKey}
                  cell={cell}
                  effectiveDay={effectiveDay}
                  elementRef={
                    summaryDateKey === cell.dateKey
                      ? summaryTriggerRef
                      : undefined
                  }
                  hasNote={Boolean(notes[cell.dateKey])}
                  hasOverride={hasOverride}
                  holiday={holidays[cell.dateKey] ?? null}
                  isDark={isDark}
                  onBeginListSelection={onBeginListSelection}
                  onPressDate={onPressDate}
                  payrollEntry={payrollEntries[cell.dateKey] ?? null}
                  selected={selectedDateKeySet.has(cell.dateKey)}
                  selectionMode={selectionMode}
                  stacked={stacked}
                  styles={styles}
                  today={today}
                  todayBlink={todayBlink}
                  weekdayIndex={weekdayIndex}
                />
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

type WeekListStyles = ReturnType<typeof createStyles>;

function CalendarWeekListRow({
  cell,
  effectiveDay,
  elementRef,
  hasNote,
  hasOverride,
  holiday,
  isDark,
  onBeginListSelection,
  onPressDate,
  payrollEntry,
  selected,
  selectionMode,
  stacked,
  styles,
  today,
  todayBlink,
  weekdayIndex,
}: {
  cell: CalendarCell;
  effectiveDay: EffectiveDay;
  elementRef?: Ref<React.ElementRef<typeof Pressable>>;
  hasNote: boolean;
  hasOverride: boolean;
  holiday: KoreanHolidayInfo | null;
  isDark: boolean;
  onBeginListSelection?: (dateKey: string) => void;
  onPressDate: (dateKey: string) => void;
  payrollEntry: PayrollCalendarEntry | null;
  selected: boolean;
  selectionMode: boolean;
  stacked: boolean;
  styles: WeekListStyles;
  today: string;
  todayBlink: Animated.Value;
  weekdayIndex: number;
}) {
  const { palette } = useAppTheme();
  const rowFocus = useWebFocusVisible();
  const longPressHandledRef = useRef(false);
  const scheduleActive = effectiveDay.scheduleActive;
  const shift = effectiveDay.shift;
  const dayException = effectiveDay.dayException;
  const dayExceptionLabel = dayException
    ? getDayExceptionLabel(dayException)
    : null;
  const exceptionAppearance = dayException
    ? getDayExceptionAppearance(dayException, palette)
    : null;
  const shiftAppearance = shift
    ? getShiftAppearance(shift, palette, isDark)
    : null;
  const specialWork = Boolean(
    !dayException && shift?.id.startsWith('substitute-'),
  );
  const isToday = cell.dateKey === today;
  const statusLabel = dayExceptionLabel ?? shift?.name ?? (scheduleActive ? '일정 없음' : '일정 적용 전');
  const shiftTimeLabel = formatCalendarWeekListTime(shift);
  const metadataItems = buildCalendarWeekListMetadata({
    hasNote,
    hasOverride,
    holidayFullLabel: holiday?.accessibilityLabel ?? null,
    payrollFullLabel: payrollEntry?.accessibilityLabel ?? null,
  });
  const interactionDisabled = isCalendarDayInteractionDisabled(
    scheduleActive,
    selectionMode,
  );
  const dayViewModel = resolveCalendarDayViewModel({
    cell,
    effectiveDay,
    hasDirectScheduleOverride: hasOverride,
    hasNote,
    holiday,
    payrollEntry,
  });
  const accessibilityLabel = buildCalendarDayAccessibilityLabel(
    dayViewModel,
    { isToday },
  );

  return (
    <Pressable
      accessibilityActions={
        scheduleActive && onBeginListSelection
          ? [{ name: 'longpress', label: '변경하거나 공유할 날짜로 선택하기' }]
          : undefined
      }
      accessibilityHint={
        selectionMode
          ? scheduleActive
            ? '선택 목록에 추가하거나 선택을 해제합니다.'
            : '일정 적용 시작일 이후 날짜만 선택할 수 있습니다.'
          : scheduleActive && onBeginListSelection
            ? '누르면 날짜 요약을 엽니다. 길게 누르면 변경하거나 공유할 날짜를 선택합니다.'
            : '누르면 날짜 요약을 엽니다.'
      }
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={selectionMode ? 'checkbox' : 'button'}
      accessibilityState={
        selectionMode
          ? { checked: selected, disabled: interactionDisabled }
          : undefined
      }
      delayLongPress={360}
      disabled={interactionDisabled}
      ref={elementRef}
      onAccessibilityAction={(event) => {
        if (
          event.nativeEvent.actionName === 'longpress' &&
          scheduleActive
        ) {
          onBeginListSelection?.(cell.dateKey);
        }
      }}
      onBlur={rowFocus.onBlur}
      onFocus={rowFocus.onFocus}
      onLongPress={
        scheduleActive && onBeginListSelection
          ? () => {
              longPressHandledRef.current = true;
              onBeginListSelection(cell.dateKey);
            }
          : undefined
      }
      onPress={() => {
        if (longPressHandledRef.current) {
          longPressHandledRef.current = false;
          return;
        }
        onPressDate(cell.dateKey);
      }}
      onPressOut={() => {
        setTimeout(() => {
          longPressHandledRef.current = false;
        }, 0);
      }}
      style={styles.rowPressable}>
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.dayRow,
            !scheduleActive && styles.inactiveRow,
            isToday && !selected && styles.todayRow,
            selected && styles.selectedRow,
            rowFocus.focusVisible && !interactionDisabled && styles.focusVisible,
            pressed && styles.pressedRow,
            isToday && { opacity: todayBlink },
          ]}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.primaryRow,
              stacked && styles.primaryRowStacked,
            ]}>
            <View style={styles.dateMetadata}>
              {selectionMode ? (
                <View
                  style={[
                    styles.selectionIndicator,
                    selected && styles.selectionIndicatorSelected,
                  ]}>
                  {selected ? (
                    <AppIcon
                      accessible={false}
                      color={palette.canvas}
                      name="checkmark"
                      size={11}
                      strokeWidth={2.6}
                    />
                  ) : null}
                </View>
              ) : null}
              <View style={[styles.dateBadge, isToday && styles.todayDateBadge]}>
                <AppText
                  color={
                    isToday
                      ? isDark
                        ? palette.canvas
                        : palette.white
                      : selected
                        ? palette.white
                        : holiday || weekdayIndex === 0
                          ? palette.coral
                          : weekdayIndex === 6
                            ? palette.weekendSaturday
                            : scheduleActive
                              ? palette.ink
                              : palette.disabledInk
                  }
                  style={styles.dateText}
                  variant="label">
                  {cell.day}일 {WEEKDAY_LABELS[weekdayIndex]}
                </AppText>
              </View>
            </View>
            <View
              style={[
                styles.workBadge,
                stacked && styles.workBadgeStacked,
                {
                  backgroundColor:
                    exceptionAppearance?.softColor ??
                    (specialWork
                      ? palette.surfaceSoft
                      : shiftAppearance?.softColor ?? palette.surfaceSoft),
                  borderColor:
                    specialWork && shiftAppearance
                      ? shiftAppearance.accentColor
                      : palette.transparent,
                },
              ]}>
              {dayExceptionLabel && exceptionAppearance ? (
                <AppIcon
                  accessible={false}
                  color={exceptionAppearance.accentColor}
                  name={exceptionAppearance.iconName}
                  size={16}
                />
              ) : shift && shiftAppearance ? (
                <AnimatedShiftIcon
                  animated={false}
                  color={shiftAppearance.accentColor}
                  kind={getShiftIconKind(shift.id, shift.isOff)}
                  size={16}
                />
              ) : null}
              <View style={styles.workCopy}>
                <AppText
                  color={
                    exceptionAppearance?.accentColor ??
                    shiftAppearance?.accentColor ??
                    palette.inkMuted
                  }
                  style={styles.workLabel}
                  variant="label">
                  {statusLabel}
                </AppText>
                {shiftTimeLabel ? (
                  <AppText
                    color={palette.inkMuted}
                    style={styles.workTime}
                    variant="caption">
                    {shiftTimeLabel}
                  </AppText>
                ) : null}
              </View>
            </View>
          </View>
          <CalendarWeekMetadataList
            items={metadataItems}
            palette={palette}
            styles={styles}
          />
        </Animated.View>
      )}
    </Pressable>
  );
}

function CalendarWeekMetadataList({
  items,
  palette,
  styles,
}: {
  items: readonly CalendarWeekListMetadataItem[];
  palette: AppPalette;
  styles: WeekListStyles;
}) {
  if (items.length === 0) return null;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.metadataList}>
      {items.map((item) => (
        <View key={item.kind} style={styles.metadataItem}>
          <View
            style={[
              styles.metadataIndicator,
              item.kind === 'holiday' && styles.holidayMetadataIndicator,
              item.kind === 'payday' && styles.paydayMetadataIndicator,
              item.kind === 'note' && styles.noteMetadataIndicator,
              item.kind === 'override' && styles.overrideMetadataIndicator,
            ]}
          />
          <AppText
            color={palette.inkMuted}
            style={styles.metadataText}
            variant="caption">
            {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    list: { backgroundColor: palette.surface },
    weekGroup: { borderBottomWidth: 1, borderBottomColor: palette.controlLine },
    weekHeader: {
      minHeight: 36,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: palette.surfaceSoft,
    },
    weekDays: { backgroundColor: palette.surface },
    rowPressable: { minWidth: 0 },
    dayRow: {
      position: 'relative',
      minHeight: 48,
      alignItems: 'stretch',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
      backgroundColor: palette.surface,
    },
    inactiveRow: { backgroundColor: palette.surfaceSoft },
    todayRow: { backgroundColor: palette.mintSoft },
    selectedRow: {
      borderWidth: 2,
      borderColor: palette.selectionBorder,
      backgroundColor: palette.indigoSoft,
    },
    primaryRow: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    primaryRowStacked: {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
    dateMetadata: {
      minWidth: 126,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    selectionIndicator: {
      width: 16,
      height: 16,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    selectionIndicatorSelected: {
      backgroundColor: palette.white,
    },
    dateBadge: {
      minHeight: 30,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
      borderRadius: 10,
    },
    todayDateBadge: { backgroundColor: palette.mint },
    dateText: { fontVariant: ['tabular-nums'] },
    workBadge: {
      minWidth: 0,
      minHeight: 34,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderWidth: 1,
      borderRadius: 11,
    },
    workBadgeStacked: { width: '100%', flex: 0 },
    workCopy: { minWidth: 0, flex: 1, gap: 1 },
    workLabel: { minWidth: 0 },
    workTime: { minWidth: 0, fontVariant: ['tabular-nums'] },
    metadataList: {
      width: '100%',
      gap: 4,
      paddingHorizontal: 4,
    },
    metadataItem: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
    },
    metadataIndicator: {
      width: 3,
      minHeight: 16,
      flexShrink: 0,
      borderRadius: 2,
      backgroundColor: palette.inkMuted,
    },
    holidayMetadataIndicator: { backgroundColor: palette.coral },
    paydayMetadataIndicator: { backgroundColor: palette.amber },
    noteMetadataIndicator: { backgroundColor: palette.indigoDark },
    overrideMetadataIndicator: { backgroundColor: palette.mint },
    metadataText: { minWidth: 0, flex: 1 },
    pressedRow: { opacity: 0.74 },
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
