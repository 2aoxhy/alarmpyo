import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppDialog } from '@/components/app-dialog';
import { AppSheet } from '@/components/app-sheet';
import { Screen } from '@/components/ui-kit';
import { spacing } from '@/constants/app-theme';
import {
  CalendarDateSummarySheet,
  type CalendarDateScheduleSummary,
  type CalendarDateSummaryData,
} from '@/features/calendar/calendar-date-summary-sheet';
import { resolveCalendarDateDirectChange } from '@/features/calendar/calendar-date-summary-presentation';
import { CalendarMonthCard } from '@/features/calendar/calendar-month-card';
import { CalendarScreenHeader } from '@/features/calendar/calendar-screen-header';
import { CalendarSelectionPanel } from '@/features/calendar/calendar-selection-panel';
import {
  CalendarHolidayNotice,
  CalendarLegend,
  CalendarMenuSections,
} from '@/features/calendar/calendar-support-sections';
import { resolveCalendarDateAtPoint } from '@/features/calendar/calendar-drag-geometry';
import { resolveCalendarSelectionCountViewModel } from '@/features/calendar/calendar-selection-presentation';
import { usesSimplifiedCalendar } from '@/design-system/responsive';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useScreenActive } from '@/hooks/use-screen-active';
import {
  buildCalendarMonthViewModel,
  type CalendarProjectionData,
} from '@/services/calendar-month-view-model';
import type { BulkDayChange } from '@/services/bulk-day-update';
import { buildScheduleShareText } from '@/services/schedule-share-service';
import {
  useAppStoreActions,
  useAppStoreData,
} from '@/store/app-store';
import {
  formatKoreanDate,
  formatMonthTitle,
  parseDateKey,
  toDateKey,
} from '@/utils/date';
import {
  moveCalendarMonthWithinRange,
  resolveCalendarMonthNavigationState,
  shouldAnnounceCalendarMonthBoundary,
} from '@/utils/calendar-month';
import { getDayExceptionLabel } from '@/utils/day-exception';
import {
  resolveCalendarDragSelection,
  toggleCalendarDateSelection,
} from '@/utils/calendar-selection';
import {
  isCalendarHorizontalSwipe,
  resolveCalendarSwipeMonthOffset,
} from '@/utils/calendar-swipe';
import { resolveFloatingTabBarLayout } from '@/utils/floating-tab-bar';

type CalendarRowLayout = { y: number; height: number };
type CalendarGridFrame = { x: number; y: number; width: number };
type CalendarDragSession = {
  anchorDateKey: string;
  currentDateKey: string;
  baseSelectedDateKeys: readonly string[];
};
type CalendarSwipeStart = {
  pageX: number;
  pageY: number;
  startedAt: number;
};

export default function CalendarScreen() {
  const { showDialog } = useAppDialog();
  const { isDark } = useAppTheme();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const screenActive = useScreenActive();
  const reduceMotion = useReduceMotion();
  const [todayBlink] = useState(() => new Animated.Value(1));
  const [todayBlinkRequest, setTodayBlinkRequest] = useState(0);
  const [today, setToday] = useState(() => toDateKey(new Date()));
  const initial = parseDateKey(today);
  const [visibleMonth, setVisibleMonth] = useState({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  });
  const [bulkSaving, setBulkSaving] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [summaryDateKey, setSummaryDateKey] = useState<string | null>(null);
  const [selectionArmed, setSelectionArmed] = useState(false);
  const [selectedDateKeys, setSelectedDateKeys] = useState<readonly string[]>([]);
  const selectedDateKeysRef = useRef<readonly string[]>([]);
  const calendarGridRef = useRef<View>(null);
  const legendTriggerRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const summaryTriggerRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const calendarGridFrameRef = useRef<CalendarGridFrame>({ x: 0, y: 0, width: 0 });
  const calendarRowLayoutsRef = useRef<Record<number, CalendarRowLayout>>({});
  const calendarDragSessionRef = useRef<CalendarDragSession | null>(null);
  const calendarSwipeStartRef = useRef<CalendarSwipeStart | null>(null);
  const longPressedDateKeyRef = useRef<string | null>(null);
  const selectionAnnouncementRef = useRef<{
    dateKey: string;
    began: boolean;
  } | null>(null);
  const lastAnnouncedMonthBoundaryRef = useRef<
    'minimum' | 'maximum' | null
  >(null);
  const { data } = useAppStoreData();
  const { saveDays } = useAppStoreActions();
  const calendarProjectionData = useMemo<CalendarProjectionData>(
    () => ({
      dayExceptions: data.dayExceptions,
      notes: data.notes,
      overrides: data.overrides,
      pattern: data.pattern,
      payrollSettings: data.payrollSettings,
      shiftTypes: data.shiftTypes,
      timeOverrides: data.timeOverrides,
    }),
    [
      data.dayExceptions,
      data.notes,
      data.overrides,
      data.pattern,
      data.payrollSettings,
      data.shiftTypes,
      data.timeOverrides,
    ],
  );
  const selectedDateKeySet = useMemo(() => new Set(selectedDateKeys), [selectedDateKeys]);
  const selectionMode = selectionArmed || selectedDateKeys.length > 0;
  const simplifiedCalendar = usesSimplifiedCalendar(fontScale);
  const compactSelectionPanel = windowWidth < 350 || fontScale >= 1.35;
  const stackSelectionActions = windowWidth < 360 || fontScale >= 1.3;
  const selectionTabBarOffset = resolveFloatingTabBarLayout(
    fontScale,
    insets.bottom,
  ).contentOffset;
  const {
    calendarLayout,
    cellRows,
    currentMonthDateKeys,
    dateSummaryByDate,
    daysByDate,
    effectiveDays,
    holidayDataStatus,
    holidays,
    monthlySummary,
    payrollEntries,
    resolveDay: getEffectiveDay,
    selectableDateKeys,
    selectableDateKeySet,
  } = useMemo(
    () =>
      buildCalendarMonthViewModel({
        data: calendarProjectionData,
        year: visibleMonth.year,
        month: visibleMonth.month,
        windowWidth,
        fontScale,
      }),
    [calendarProjectionData, fontScale, visibleMonth.month, visibleMonth.year, windowWidth],
  );
  const selectionCount = useMemo(
    () =>
      resolveCalendarSelectionCountViewModel(
        selectedDateKeys,
        currentMonthDateKeys,
      ),
    [currentMonthDateKeys, selectedDateKeys],
  );
  const monthNavigation = useMemo(
    () => resolveCalendarMonthNavigationState(visibleMonth),
    [visibleMonth],
  );
  const summaryData = useMemo<CalendarDateSummaryData | null>(() => {
    if (!summaryDateKey) return null;
    const day = daysByDate.get(summaryDateKey);
    const summary = dateSummaryByDate.get(summaryDateKey);
    if (!day || !summary) return null;

    const actualLabel = summary.dayException
      ? getDayExceptionLabel(summary.dayException)
      : summary.effectiveShift?.name ?? null;
    const toSchedule = (
      label: string | null,
      shift: typeof summary.effectiveShift,
    ): CalendarDateScheduleSummary | null =>
      label
        ? {
            endsNextDay: shift?.endsNextDay ?? false,
            endMinutes: shift?.endMinutes ?? null,
            label,
            startMinutes: shift?.startMinutes ?? null,
          }
        : null;
    const directChange = resolveCalendarDateDirectChange({
      hasSpecialSchedule: Boolean(summary.dayException),
      hasShiftOverride: summary.hasShiftOverride,
      hasTimeOverride: summary.hasTimeOverride,
    });

    return {
      actualSchedule: toSchedule(actualLabel, summary.effectiveShift),
      baseSchedule: toSchedule(
        summary.basePatternShift?.name ?? null,
        summary.basePatternShift,
      ),
      dateKey: summaryDateKey,
      directChange,
      editable: summary.scheduleActive,
      holiday: day.holiday,
      isToday: summaryDateKey === today,
      note: summary.note,
      payrollEntry: day.payrollEntry,
    };
  }, [dateSummaryByDate, daysByDate, summaryDateKey, today]);

  useEffect(() => {
    if (!screenActive) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const scheduleNextDay = () => {
      const now = new Date();
      setToday(toDateKey(now));
      const nextDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timeout = setTimeout(scheduleNextDay, nextDay.getTime() - now.getTime() + 50);
    };

    scheduleNextDay();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [screenActive]);

  useEffect(() => {
    if (todayBlinkRequest === 0) return;

    todayBlink.stopAnimation();
    todayBlink.setValue(1);
    if (reduceMotion) return;

    const animation = Animated.sequence([
      Animated.timing(todayBlink, {
        duration: 140,
        easing: Easing.inOut(Easing.quad),
        toValue: 0.55,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(todayBlink, {
        duration: 160,
        easing: Easing.inOut(Easing.quad),
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(todayBlink, {
        duration: 140,
        easing: Easing.inOut(Easing.quad),
        toValue: 0.55,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(todayBlink, {
        duration: 160,
        easing: Easing.inOut(Easing.quad),
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, todayBlink, todayBlinkRequest]);

  const clearDateSelection = useCallback(() => {
    selectionAnnouncementRef.current = null;
    calendarDragSessionRef.current = null;
    longPressedDateKeyRef.current = null;
    selectedDateKeysRef.current = [];
    setSelectedDateKeys([]);
    setSelectionArmed(false);
  }, []);

  const startDateSelection = useCallback(() => {
    setLegendOpen(false);
    setSummaryDateKey(null);
    setSelectionArmed(true);
    void Haptics.selectionAsync();
    AccessibilityInfo.announceForAccessibility(
      calendarLayout.presentation === 'month-grid'
        ? '일정 선택을 시작했습니다. 날짜를 누르거나 손가락을 끌어 선택해야 합니다.'
        : '일정 선택을 시작했습니다. 날짜를 하나씩 눌러 선택해야 합니다.',
    );
  }, [calendarLayout.presentation]);

  const cancelDateSelection = useCallback(() => {
    clearDateSelection();
    AccessibilityInfo.announceForAccessibility('일정 선택을 취소했습니다.');
  }, [clearDateSelection]);

  useEffect(() => {
    const pending = selectionAnnouncementRef.current;
    if (!pending) return;
    selectionAnnouncementRef.current = null;
    if (pending.began) {
      AccessibilityInfo.announceForAccessibility(
        calendarLayout.presentation === 'month-grid'
          ? `${formatKoreanDate(pending.dateKey)}부터 일정 선택을 시작했습니다. 다른 날짜를 누르거나 손가락을 끌어 추가할 수 있습니다.`
          : `${formatKoreanDate(pending.dateKey)}부터 일정 선택을 시작했습니다. 다른 날짜를 하나씩 눌러 추가할 수 있습니다.`,
      );
      return;
    }
    const selected = selectedDateKeySet.has(pending.dateKey);
    AccessibilityInfo.announceForAccessibility(
      selected
        ? `${formatKoreanDate(pending.dateKey)}을 선택했습니다. 선택한 날짜는 ${selectedDateKeys.length}일입니다.`
        : `${formatKoreanDate(pending.dateKey)} 선택을 해제했습니다. 선택한 날짜는 ${selectedDateKeys.length}일입니다.`,
    );
  }, [calendarLayout.presentation, selectedDateKeySet, selectedDateKeys.length]);

  useEffect(() => {
    if (!screenActive || !selectionMode || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      clearDateSelection();
      AccessibilityInfo.announceForAccessibility('일정 선택을 취소했습니다.');
      return true;
    });
    return () => subscription.remove();
  }, [clearDateSelection, screenActive, selectionMode]);

  const changeMonth = useCallback(
    (amount: number) => {
      const result = moveCalendarMonthWithinRange(visibleMonth, amount);
      if (result.status === 'boundary') {
        if (
          shouldAnnounceCalendarMonthBoundary(
            lastAnnouncedMonthBoundaryRef.current,
            result.boundary,
          )
        ) {
          lastAnnouncedMonthBoundaryRef.current = result.boundary;
          AccessibilityInfo.announceForAccessibility(
            result.boundary === 'minimum'
              ? '지원하는 첫 달입니다.'
              : '지원하는 마지막 달입니다.',
          );
        }
        return visibleMonth;
      }
      const next = result.month;
      lastAnnouncedMonthBoundaryRef.current = null;
      calendarDragSessionRef.current = null;
      calendarRowLayoutsRef.current = {};
      setSummaryDateKey(null);
      setVisibleMonth(next);
      AccessibilityInfo.announceForAccessibility(
        `${formatMonthTitle(next.year, next.month)}로 이동했습니다.`,
      );
      return next;
    },
    [visibleMonth],
  );

  const goToday = () => {
    const now = new Date();
    const next = { year: now.getFullYear(), month: now.getMonth() };
    const monthChanged =
      visibleMonth.year !== next.year || visibleMonth.month !== next.month;
    calendarDragSessionRef.current = null;
    lastAnnouncedMonthBoundaryRef.current = null;
    calendarRowLayoutsRef.current = {};
    setSummaryDateKey(null);
    setVisibleMonth(next);
    setTodayBlinkRequest((request) => request + 1);
    AccessibilityInfo.announceForAccessibility(
      monthChanged
        ? `${formatMonthTitle(next.year, next.month)}로 이동하고 오늘 날짜를 강조했습니다.`
        : '오늘 날짜를 강조했습니다.',
    );
  };

  const toggleDateSelection = useCallback((dateKey: string) => {
    void Haptics.selectionAsync();
    setSelectionArmed(true);
    selectionAnnouncementRef.current = { dateKey, began: false };
    setSelectedDateKeys((current) => {
      const next = toggleCalendarDateSelection(current, dateKey);
      selectedDateKeysRef.current = next;
      return next;
    });
  }, []);

  const beginDateSelection = useCallback(
    (dateKey: string) => {
      void Haptics.selectionAsync();
      setSelectionArmed(true);
      const baseSelectedDateKeys = selectedDateKeysRef.current;
      calendarDragSessionRef.current = {
        anchorDateKey: dateKey,
        currentDateKey: dateKey,
        baseSelectedDateKeys,
      };
      longPressedDateKeyRef.current = dateKey;
      selectionAnnouncementRef.current = { dateKey, began: true };
      const next = resolveCalendarDragSelection(
        baseSelectedDateKeys,
        selectableDateKeys,
        dateKey,
        dateKey,
      );
      selectedDateKeysRef.current = next;
      setSelectedDateKeys(next);
    },
    [selectableDateKeys],
  );

  const beginListDateSelection = useCallback(
    (dateKey: string) => {
      void Haptics.selectionAsync();
      setSelectionArmed(true);
      calendarDragSessionRef.current = null;
      selectionAnnouncementRef.current = { dateKey, began: true };
      setSelectedDateKeys((current) => {
        const next = current.includes(dateKey)
          ? current
          : [...current, dateKey].sort();
        selectedDateKeysRef.current = next;
        return next;
      });
    },
    [],
  );

  const pressCalendarDate = useCallback(
    (dateKey: string) => {
      if (longPressedDateKeyRef.current === dateKey) {
        longPressedDateKeyRef.current = null;
        return;
      }
      if (selectionMode) {
        toggleDateSelection(dateKey);
        return;
      }
      setSummaryDateKey(dateKey);
    },
    [selectionMode, toggleDateSelection],
  );

  const measureCalendarGrid = useCallback(() => {
    calendarGridRef.current?.measureInWindow((x, y, width) => {
      calendarGridFrameRef.current = { x, y, width };
    });
  }, []);

  const findDraggedDateKey = useCallback(
    (pageX: number, pageY: number) => {
      return resolveCalendarDateAtPoint({
        cellRows,
        gridFrame: calendarGridFrameRef.current,
        pageX,
        pageY,
        rowLayouts: calendarRowLayoutsRef.current,
        selectableDateKeySet,
      });
    },
    [cellRows, selectableDateKeySet],
  );

  const updateDateDrag = useCallback(
    (pageX: number, pageY: number) => {
      const session = calendarDragSessionRef.current;
      if (!session) return;

      const dateKey = findDraggedDateKey(pageX, pageY);
      if (!dateKey || dateKey === session.currentDateKey) return;

      const next = resolveCalendarDragSelection(
        session.baseSelectedDateKeys,
        selectableDateKeys,
        session.anchorDateKey,
        dateKey,
      );
      calendarDragSessionRef.current = { ...session, currentDateKey: dateKey };
      selectedDateKeysRef.current = next;
      setSelectedDateKeys(next);
    },
    [findDraggedDateKey, selectableDateKeys],
  );

  const finishDateDrag = useCallback(() => {
    const session = calendarDragSessionRef.current;
    if (!session) return;

    calendarDragSessionRef.current = null;
    if (session.currentDateKey !== session.anchorDateKey) {
      AccessibilityInfo.announceForAccessibility(
        `${selectedDateKeysRef.current.length}일을 선택했습니다.`,
      );
    }

    const longPressedDateKey = session.anchorDateKey;
    setTimeout(() => {
      if (longPressedDateKeyRef.current === longPressedDateKey) {
        longPressedDateKeyRef.current = null;
      }
    }, 0);
  }, []);

  const calendarGridViewProps = useMemo<ViewProps>(
    () => ({
      onMoveShouldSetResponder: () => calendarDragSessionRef.current !== null,
      onMoveShouldSetResponderCapture: () =>
        calendarDragSessionRef.current !== null,
      onResponderGrant: (event) => {
        updateDateDrag(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
      onResponderMove: (event) => {
        updateDateDrag(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
      onResponderRelease: finishDateDrag,
      onResponderTerminate: finishDateDrag,
      onResponderTerminationRequest: () =>
        calendarDragSessionRef.current === null,
      onTouchStart: measureCalendarGrid,
      onTouchEndCapture: finishDateDrag,
    }),
    [finishDateDrag, measureCalendarGrid, updateDateDrag],
  );
  const onCalendarGridLayout = useCallback<
    NonNullable<ViewProps['onLayout']>
  >(
    (event) => {
      calendarGridFrameRef.current = {
        ...calendarGridFrameRef.current,
        width: event.nativeEvent.layout.width,
      };
      measureCalendarGrid();
    },
    [measureCalendarGrid],
  );
  const onCalendarRowLayout = useCallback(
    (rowIndex: number, layout: CalendarRowLayout) => {
      calendarRowLayoutsRef.current[rowIndex] = layout;
    },
    [],
  );
  const calendarSwipeViewProps = useMemo<ViewProps>(
    () => ({
      onMoveShouldSetResponderCapture: (event) => {
        const start = calendarSwipeStartRef.current;
        if (!start || selectionMode) return false;
        return isCalendarHorizontalSwipe({
          dx: event.nativeEvent.pageX - start.pageX,
          dy: event.nativeEvent.pageY - start.pageY,
        });
      },
      onResponderRelease: (event) => {
        const start = calendarSwipeStartRef.current;
        calendarSwipeStartRef.current = null;
        if (!start || selectionMode) return;

        const elapsed = Math.max(Date.now() - start.startedAt, 1);
        const dx = event.nativeEvent.pageX - start.pageX;
        const amount = resolveCalendarSwipeMonthOffset({
          dx,
          dy: event.nativeEvent.pageY - start.pageY,
          vx: dx / elapsed,
        });
        if (amount === 0) return;

        changeMonth(amount);
        void Haptics.selectionAsync();
      },
      onResponderTerminate: () => {
        calendarSwipeStartRef.current = null;
      },
      onResponderTerminationRequest: () => true,
      onTouchStart: (event) => {
        calendarSwipeStartRef.current = selectionMode
          ? null
          : {
              pageX: event.nativeEvent.pageX,
              pageY: event.nativeEvent.pageY,
              startedAt: Date.now(),
            };
      },
    }),
    [changeMonth, selectionMode],
  );

  const shareSelectedSchedules = useCallback(
    async (message: string) => {
      try {
        await Share.share(
          { message, title: '알람표 근무 일정' },
          { dialogTitle: '알람표 근무 일정 공유하기' },
        );
        AccessibilityInfo.announceForAccessibility(
          '공유 화면을 닫았습니다. 선택한 일정은 유지했습니다.',
        );
      } catch {
        showDialog(
          '일정을 공유하지 못했습니다',
          '공유할 앱을 확인한 뒤 다시 시도해야 합니다.',
        );
      }
    },
    [showDialog],
  );

  const openScheduleShareDialog = useCallback(() => {
    try {
      const message = buildScheduleShareText(
        selectedDateKeys.map((dateKey) => getEffectiveDay(dateKey)),
      );
      showDialog(
        `${selectedDateKeys.length}일 일정 공유하기`,
        `아래 내용으로 공유합니다. 개인 메모는 포함하지 않았습니다.\n\n${message}`,
        [
          {
            text: '뒤로 가기',
            actionId: 'back',
            icon: 'chevron-back',
            style: 'cancel',
          },
          {
            text: '일정 공유하기',
            actionId: 'confirm',
            icon: 'share-outline',
            onPress: () => void shareSelectedSchedules(message),
          },
        ],
        { tone: 'neutral' },
      );
    } catch (error) {
      showDialog(
        '공유할 일정을 확인해야 합니다',
        error instanceof Error ? error.message : '일정을 다시 선택해야 합니다.',
      );
    }
  }, [getEffectiveDay, selectedDateKeys, shareSelectedSchedules, showDialog]);

  const applySelectedDateChange = useCallback(
    async (change: BulkDayChange, label: string) => {
      if (bulkSaving || selectedDateKeys.length === 0) return;
      setBulkSaving(true);
      try {
        const saved = await saveDays(selectedDateKeys, change);
        if (!saved) {
          showDialog(
            '일정을 변경하지 못했습니다',
            '날짜와 휴대폰 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
          );
          return;
        }
        const count = selectedDateKeys.length;
        clearDateSelection();
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        AccessibilityInfo.announceForAccessibility(
          `${count}일 일정을 변경했습니다. 적용 내용은 ${label}입니다.`,
        );
      } finally {
        setBulkSaving(false);
      }
    },
    [
      bulkSaving,
      clearDateSelection,
      saveDays,
      selectedDateKeys,
      showDialog,
    ],
  );

  const openBulkShiftDialog = useCallback(() => {
    showDialog(
      '근무를 선택해야 합니다',
      `${selectedDateKeys.length}일의 날짜별 시간 변경과 예외 일정을 정리하고, 개인 메모는 유지합니다.`,
      [
        {
          text: '뒤로 가기',
          actionId: 'back',
          icon: 'chevron-back',
          style: 'cancel',
        },
        {
          text: '주간으로 변경하기',
          actionId: 'confirm',
          icon: 'shift-day',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'day' },
              '주간',
            ),
        },
        {
          text: '야간으로 변경하기',
          actionId: 'confirm',
          icon: 'shift-night',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'night' },
              '야간',
            ),
        },
        {
          text: '주대로 변경하기',
          actionId: 'confirm',
          icon: 'shift-substitute',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'substitute-day' },
              '주대',
            ),
        },
        {
          text: '야대로 변경하기',
          actionId: 'confirm',
          icon: 'shift-substitute',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'substitute-night' },
              '야대',
            ),
        },
        {
          text: '휴무로 변경하기',
          actionId: 'confirm',
          icon: 'shift-off',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'off' },
              '휴무',
            ),
        },
      ],
      { tone: 'neutral' },
    );
  }, [
    applySelectedDateChange,
    selectedDateKeys.length,
    showDialog,
  ]);

  const openBulkExceptionDialog = useCallback(() => {
    showDialog(
      '예외 일정을 선택해야 합니다',
      `${selectedDateKeys.length}일의 기본 근무와 개인 메모는 유지합니다. 교육과 예비군은 주간 알람을 사용합니다.`,
      [
        {
          text: '뒤로 가기',
          actionId: 'back',
          icon: 'chevron-back',
          style: 'cancel',
        },
        {
          text: '연차로 변경하기',
          actionId: 'confirm',
          icon: 'calendar-outline',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'exception', dayException: 'leave' },
              '연차',
            ),
        },
        {
          text: '교육으로 변경하기',
          actionId: 'confirm',
          icon: 'book-outline',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'exception', dayException: 'training' },
              '교육',
            ),
        },
        {
          text: '예비군으로 변경하기',
          actionId: 'confirm',
          icon: 'shield-outline',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'exception', dayException: 'reserve' },
              '예비군',
            ),
        },
        {
          text: '예외 일정 해제하기',
          actionId: 'confirm',
          icon: 'close',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'exception', dayException: null },
              '예외 일정 해제',
            ),
        },
      ],
      { tone: 'neutral' },
    );
  }, [
    applySelectedDateChange,
    selectedDateKeys.length,
    showDialog,
  ]);

  const confirmBulkPatternRestore = useCallback(() => {
    showDialog(
      '기본 근무표로 되돌리시겠습니까?',
      `${selectedDateKeys.length}일의 직접 변경한 근무·시간·예외 일정만 정리합니다. 개인 메모는 유지합니다.`,
      [
        {
          text: '뒤로 가기',
          actionId: 'back',
          icon: 'chevron-back',
          style: 'cancel',
        },
        {
          text: '기본 근무표로 되돌리기',
          actionId: 'delete',
          icon: 'trash-outline',
          style: 'destructive',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'pattern' },
              '기본 근무표',
            ),
        },
      ],
      { tone: 'danger' },
    );
  }, [
    applySelectedDateChange,
    selectedDateKeys.length,
    showDialog,
  ]);

  const openBulkChangeDialog = useCallback(() => {
    if (selectedDateKeys.length === 0) return;
    showDialog(
      `${selectedDateKeys.length}일 일정 변경하기`,
      '선택한 날짜를 한 번에 변경합니다.',
      [
        {
          text: '뒤로 가기',
          actionId: 'back',
          icon: 'chevron-back',
          style: 'cancel',
        },
        {
          text: '근무 지정하기',
          actionId: 'confirm',
          icon: 'repeat-outline',
          onPress: openBulkShiftDialog,
        },
        {
          text: '예외 일정 지정하기',
          actionId: 'confirm',
          icon: 'calendar-outline',
          onPress: openBulkExceptionDialog,
        },
        {
          text: '기본 근무표로 되돌리기',
          actionId: 'delete',
          icon: 'trash-outline',
          onPress: confirmBulkPatternRestore,
        },
      ],
      { tone: 'neutral' },
    );
  }, [
    confirmBulkPatternRestore,
    openBulkExceptionDialog,
    openBulkShiftDialog,
    selectedDateKeys.length,
    showDialog,
  ]);

  const closeDateSummary = useCallback(() => {
    setSummaryDateKey(null);
  }, []);

  const editSummaryDate = useCallback(() => {
    const dateKey = summaryDateKey;
    if (!dateKey) return;
    setSummaryDateKey(null);
    router.push({ pathname: '/day/[date]', params: { date: dateKey } });
  }, [summaryDateKey]);

  return (
    <>
      <Screen
        contentStyle={[
          screenStyles.screen,
          { paddingHorizontal: calendarLayout.screenInset },
        ]}
        footerBottomOffset={selectionMode ? selectionTabBarOffset : 0}
        footer={
          selectionMode ? (
            <CalendarSelectionPanel
              bulkSaving={bulkSaving}
              compact={compactSelectionPanel}
              onCancel={cancelDateSelection}
              onChange={openBulkChangeDialog}
              onShare={openScheduleShareDialog}
              selectedCount={selectedDateKeys.length}
              selectedInMonthCount={selectionCount.currentMonthCount}
              stackActions={stackSelectionActions}
            />
          ) : undefined
        }
        maxContentWidth={720}>
        <CalendarScreenHeader
          onGoToday={goToday}
        onStartSelection={startDateSelection}
        selectionMode={selectionMode}
        supportsDragSelection={calendarLayout.presentation === 'month-grid'}
        />

        <CalendarMonthCard
          calendarLayout={calendarLayout}
          canGoNextMonth={monthNavigation.canMoveNext}
          canGoPreviousMonth={monthNavigation.canMovePrevious}
          cellRows={cellRows}
          effectiveDays={effectiveDays}
          fontScale={fontScale}
          gridRef={calendarGridRef}
          gridViewProps={calendarGridViewProps}
          holidays={holidays}
          isDark={isDark}
          monthlyWorkdayCount={monthlySummary.workdayCount}
          notes={data.notes}
          onBeginListSelection={beginListDateSelection}
          onBeginSelection={beginDateSelection}
          onChangeMonth={changeMonth}
          onGridLayout={onCalendarGridLayout}
          onPressDate={pressCalendarDate}
          onRowLayout={onCalendarRowLayout}
          overrides={data.overrides}
          payrollEntries={payrollEntries}
          selectedDateKeySet={selectedDateKeySet}
          selectionMode={selectionMode}
          simplified={simplifiedCalendar}
          summaryDateKey={summaryDateKey}
          summaryTriggerRef={summaryTriggerRef}
          swipeViewProps={calendarSwipeViewProps}
          timeOverrides={data.timeOverrides}
          today={today}
          todayBlink={todayBlink}
          visibleMonth={visibleMonth}
        />

        <CalendarHolidayNotice
          status={holidayDataStatus}
          visibleYear={visibleMonth.year}
        />

        <CalendarMenuSections
          onOpenLegend={() => setLegendOpen(true)}
          showCompactKey={calendarLayout.presentation === 'month-grid'}
          triggerRef={legendTriggerRef}
        />

      </Screen>
      <AppSheet
        onClose={() => setLegendOpen(false)}
        returnFocusRef={legendTriggerRef}
        title="달력 표시 안내"
        visible={legendOpen}>
        <CalendarLegend isDark={isDark} shiftTypes={data.shiftTypes} />
      </AppSheet>
      <CalendarDateSummarySheet
        data={summaryData}
        onClose={closeDateSummary}
        onEdit={editSummaryDate}
        triggerRef={summaryTriggerRef}
        visible={summaryDateKey !== null}
      />
    </>
  );
}

const screenStyles = StyleSheet.create({
  screen: {
    gap: spacing.medium,
    paddingTop: spacing.small,
  },
});
