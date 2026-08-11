import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Platform,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppDialog } from '@/components/app-dialog';
import { Screen } from '@/components/ui-kit';
import { spacing } from '@/constants/app-theme';
import { CalendarMonthCard } from '@/features/calendar/calendar-month-card';
import { CalendarScreenHeader } from '@/features/calendar/calendar-screen-header';
import { CalendarSelectionPanel } from '@/features/calendar/calendar-selection-panel';
import {
  CalendarHolidayNotice,
  CalendarLargeTextStatusSummary,
  CalendarMenuSections,
} from '@/features/calendar/calendar-support-sections';
import { usesSimplifiedCalendar } from '@/design-system/responsive';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useScreenActive } from '@/hooks/use-screen-active';
import {
  buildWorkCalendarIcs,
  exportWorkCalendarFile,
} from '@/services/calendar-export-service';
import { buildCalendarMonthViewModel } from '@/services/calendar-month-view-model';
import type { BulkDayChange } from '@/services/bulk-day-update';
import { buildScheduleShareText } from '@/services/schedule-share-service';
import {
  useAppStoreActions,
  useAppStoreData,
} from '@/store/app-store';
import {
  formatKoreanDate,
  formatMonthTitle,
  moveMonth,
  parseDateKey,
  toDateKey,
} from '@/utils/date';
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
  const [exportingCalendar, setExportingCalendar] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [includeNotesInExport, setIncludeNotesInExport] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [selectionArmed, setSelectionArmed] = useState(false);
  const [selectedDateKeys, setSelectedDateKeys] = useState<readonly string[]>([]);
  const selectedDateKeysRef = useRef<readonly string[]>([]);
  const calendarGridRef = useRef<View>(null);
  const calendarGridFrameRef = useRef<CalendarGridFrame>({ x: 0, y: 0, width: 0 });
  const calendarRowLayoutsRef = useRef<Record<number, CalendarRowLayout>>({});
  const calendarDragSessionRef = useRef<CalendarDragSession | null>(null);
  const calendarSwipeStartRef = useRef<CalendarSwipeStart | null>(null);
  const longPressedDateKeyRef = useRef<string | null>(null);
  const exportInFlightRef = useRef(false);
  const includeNotesInExportRef = useRef(false);
  const selectionAnnouncementRef = useRef<{
    dateKey: string;
    began: boolean;
  } | null>(null);
  const { data } = useAppStoreData();
  const { saveDays } = useAppStoreActions();
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
    effectiveDays,
    holidayDataStatus,
    holidays,
    monthlySummary,
    payPeriodSummary,
    payrollEntries,
    resolveDay: getEffectiveDay,
    selectableDateKeys,
    selectableDateKeySet,
  } = useMemo(
    () =>
      buildCalendarMonthViewModel({
        data,
        year: visibleMonth.year,
        month: visibleMonth.month,
        windowWidth,
        fontScale,
      }),
    [data, fontScale, visibleMonth.month, visibleMonth.year, windowWidth],
  );

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
    setSummaryExpanded(false);
    setLegendExpanded(false);
    setSelectionArmed(true);
    void Haptics.selectionAsync();
    AccessibilityInfo.announceForAccessibility(
      '일정 선택을 시작했어요. 날짜를 누르거나 손가락을 끌어 선택하세요.',
    );
  }, []);

  const cancelDateSelection = useCallback(() => {
    clearDateSelection();
    AccessibilityInfo.announceForAccessibility('일정 선택을 취소했어요.');
  }, [clearDateSelection]);

  useEffect(() => {
    const pending = selectionAnnouncementRef.current;
    if (!pending) return;
    selectionAnnouncementRef.current = null;
    if (pending.began) {
      AccessibilityInfo.announceForAccessibility(
        `${formatKoreanDate(pending.dateKey)}부터 일정 선택을 시작했어요. 다른 날짜를 누르거나 손가락을 끌어 추가할 수 있어요.`,
      );
      return;
    }
    const selected = selectedDateKeySet.has(pending.dateKey);
    AccessibilityInfo.announceForAccessibility(
      selected
        ? `${formatKoreanDate(pending.dateKey)}을 선택했어요. ${selectedDateKeys.length}일 선택했어요.`
        : `${formatKoreanDate(pending.dateKey)} 선택을 해제했어요. ${selectedDateKeys.length}일 선택했어요.`,
    );
  }, [selectedDateKeySet, selectedDateKeys.length]);

  useEffect(() => {
    if (!screenActive || !selectionMode || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      clearDateSelection();
      AccessibilityInfo.announceForAccessibility('일정 선택을 취소했어요.');
      return true;
    });
    return () => subscription.remove();
  }, [clearDateSelection, screenActive, selectionMode]);

  const changeMonth = useCallback(
    (amount: number) => {
      const next = moveMonth(visibleMonth.year, visibleMonth.month, amount);
      clearDateSelection();
      setVisibleMonth(next);
      return next;
    },
    [clearDateSelection, visibleMonth.month, visibleMonth.year],
  );

  const goToday = () => {
    const now = new Date();
    clearDateSelection();
    setVisibleMonth({ year: now.getFullYear(), month: now.getMonth() });
    setTodayBlinkRequest((request) => request + 1);
    AccessibilityInfo.announceForAccessibility('오늘이 있는 달로 이동했어요.');
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
      router.push({ pathname: '/day/[date]', params: { date: dateKey } });
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
      const gridFrame = calendarGridFrameRef.current;
      const locationX = pageX - gridFrame.x;
      const locationY = pageY - gridFrame.y;
      if (
        gridFrame.width <= 0 ||
        locationX < 0 ||
        locationX >= gridFrame.width
      ) {
        return null;
      }

      const rowIndex = cellRows.findIndex((_, index) => {
        const layout = calendarRowLayoutsRef.current[index];
        return Boolean(
          layout && locationY >= layout.y && locationY < layout.y + layout.height,
        );
      });
      if (rowIndex < 0) return null;

      const weekdayIndex = Math.min(6, Math.floor(locationX / (gridFrame.width / 7)));
      const cell = cellRows[rowIndex]?.[weekdayIndex];
      if (!cell?.inCurrentMonth || !selectableDateKeySet.has(cell.dateKey)) return null;
      return cell.dateKey;
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
        `${selectedDateKeysRef.current.length}일을 선택했어요.`,
      );
    }

    const longPressedDateKey = session.anchorDateKey;
    setTimeout(() => {
      if (longPressedDateKeyRef.current === longPressedDateKey) {
        longPressedDateKeyRef.current = null;
      }
    }, 0);
  }, []);

  const shareSelectedSchedules = useCallback(
    async (message: string) => {
      try {
        await Share.share(
          { message, title: '알람표 근무 일정' },
          { dialogTitle: '알람표 근무 일정 공유하기' },
        );
        AccessibilityInfo.announceForAccessibility(
          '공유 화면을 닫았어요. 선택한 일정은 유지했어요.',
        );
      } catch (error) {
        showDialog(
          '일정을 공유하지 못했어요',
          error instanceof Error && /[가-힣]/.test(error.message)
            ? error.message
            : '공유할 앱을 확인한 뒤 다시 시도하세요.',
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
        `아래 내용으로 공유해요. 개인 메모는 포함하지 않았어요.\n\n${message}`,
        [
          { text: '뒤로 가기', style: 'cancel' },
          {
            text: '일정 공유하기',
            onPress: () => void shareSelectedSchedules(message),
          },
        ],
      );
    } catch (error) {
      showDialog(
        '공유할 일정을 확인하세요',
        error instanceof Error ? error.message : '일정을 다시 선택하세요.',
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
            '일정을 변경하지 못했어요',
            '날짜와 휴대폰 저장 공간을 확인한 뒤 다시 시도하세요.',
          );
          return;
        }
        const count = selectedDateKeys.length;
        clearDateSelection();
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        AccessibilityInfo.announceForAccessibility(
          `${count}일 일정을 변경했어요. 적용 내용은 ${label}이에요.`,
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
      '근무를 선택하세요',
      `${selectedDateKeys.length}일의 날짜별 시간 변경과 예외 일정을 정리하고, 개인 메모는 유지해요.`,
      [
        { text: '뒤로 가기', style: 'cancel' },
        {
          text: '주간으로 변경하기',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'day' },
              '주간',
            ),
        },
        {
          text: '야간으로 변경하기',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'night' },
              '야간',
            ),
        },
        {
          text: '주간 대체근무로 변경하기',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'substitute-day' },
              '주간 대체근무',
            ),
        },
        {
          text: '야간 대체근무로 변경하기',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'substitute-night' },
              '야간 대체근무',
            ),
        },
        {
          text: '휴무로 변경하기',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'shift', shiftTypeId: 'off' },
              '휴무',
            ),
        },
      ],
    );
  }, [
    applySelectedDateChange,
    selectedDateKeys.length,
    showDialog,
  ]);

  const openBulkExceptionDialog = useCallback(() => {
    showDialog(
      '예외 일정을 선택하세요',
      `${selectedDateKeys.length}일의 기본 근무와 개인 메모는 유지해요. 교육과 예비군은 주간 알람을 사용해요.`,
      [
        { text: '뒤로 가기', style: 'cancel' },
        {
          text: '연차로 변경하기',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'exception', dayException: 'leave' },
              '연차',
            ),
        },
        {
          text: '교육으로 변경하기',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'exception', dayException: 'training' },
              '교육',
            ),
        },
        {
          text: '예비군으로 변경하기',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'exception', dayException: 'reserve' },
              '예비군',
            ),
        },
        {
          text: '예외 일정 해제하기',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'exception', dayException: null },
              '예외 일정 해제',
            ),
        },
      ],
    );
  }, [
    applySelectedDateChange,
    selectedDateKeys.length,
    showDialog,
  ]);

  const confirmBulkPatternRestore = useCallback(() => {
    showDialog(
      '기본 근무표로 되돌릴까요?',
      `${selectedDateKeys.length}일의 직접 변경한 근무·시간·예외 일정만 정리해요. 개인 메모는 유지해요.`,
      [
        { text: '뒤로 가기', style: 'cancel' },
        {
          text: '기본 근무표로 되돌리기',
          style: 'destructive',
          onPress: () =>
            void applySelectedDateChange(
              { kind: 'pattern' },
              '기본 근무표',
            ),
        },
      ],
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
      '선택한 날짜를 한 번에 변경해요.',
      [
        { text: '뒤로 가기', style: 'cancel' },
        { text: '근무 지정하기', onPress: openBulkShiftDialog },
        { text: '예외 일정 지정하기', onPress: openBulkExceptionDialog },
        {
          text: '기본 근무표로 되돌리기',
          onPress: confirmBulkPatternRestore,
        },
      ],
    );
  }, [
    confirmBulkPatternRestore,
    openBulkExceptionDialog,
    openBulkShiftDialog,
    selectedDateKeys.length,
    showDialog,
  ]);

  const exportVisibleMonth = async () => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    const includePersonalNotes = includeNotesInExportRef.current;
    setExportingCalendar(true);
    try {
      const contents = buildWorkCalendarIcs({
        year: visibleMonth.year,
        month: visibleMonth.month,
        resolveDay: getEffectiveDay,
        getNote: (dateKey) => data.notes[dateKey] ?? '',
        includeNotes: includePersonalNotes,
      });
      const fileName = await exportWorkCalendarFile(
        contents,
        visibleMonth.year,
        visibleMonth.month,
      );
      showDialog(
        '달력 파일 준비 완료',
        `${fileName} 파일의 공유·저장 화면을 닫았어요. 앱이나 위치를 선택한 경우에만 파일이 전달돼요.`,
      );
    } catch (error) {
      showDialog(
        '달력 파일을 만들지 못했어요',
        error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
      );
    } finally {
      setExportingCalendar(false);
      exportInFlightRef.current = false;
    }
  };

  return (
    <Screen
      contentStyle={[screenStyles.screen, { paddingHorizontal: calendarLayout.screenInset }]}
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
            stackActions={stackSelectionActions}
          />
        ) : undefined
      }
      maxContentWidth={720}>
      <CalendarScreenHeader
        onCancelSelection={cancelDateSelection}
        onGoToday={goToday}
        onStartSelection={startDateSelection}
        selectionMode={selectionMode}
      />

      <CalendarMonthCard
        calendarLayout={calendarLayout}
        cellRows={cellRows}
        effectiveDays={effectiveDays}
        fontScale={fontScale}
        gridRef={calendarGridRef}
        gridViewProps={{
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
        }}
        holidays={holidays}
        isDark={isDark}
        monthlyWorkdayCount={monthlySummary.workdayCount}
        notes={data.notes}
        onBeginSelection={beginDateSelection}
        onChangeMonth={changeMonth}
        onGridLayout={(event) => {
          calendarGridFrameRef.current = {
            ...calendarGridFrameRef.current,
            width: event.nativeEvent.layout.width,
          };
          measureCalendarGrid();
        }}
        onPressDate={pressCalendarDate}
        onRowLayout={(rowIndex, layout) => {
          calendarRowLayoutsRef.current[rowIndex] = layout;
        }}
        overrides={data.overrides}
        payrollEntries={payrollEntries}
        selectedDateKeySet={selectedDateKeySet}
        selectionMode={selectionMode}
        simplified={simplifiedCalendar}
        swipeViewProps={{
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

            const next = changeMonth(amount);
            void Haptics.selectionAsync();
            AccessibilityInfo.announceForAccessibility(
              `${formatMonthTitle(next.year, next.month)}로 이동했어요.`,
            );
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
        }}
        timeOverrides={data.timeOverrides}
        today={today}
        todayBlink={todayBlink}
        visibleMonth={visibleMonth}
      />

      {simplifiedCalendar ? (
        <CalendarLargeTextStatusSummary
          dateKeys={cellRows.flatMap((row) =>
            row.filter((cell) => cell.inCurrentMonth).map((cell) => cell.dateKey),
          )}
          holidays={holidays}
          payrollEntries={payrollEntries}
        />
      ) : null}

      <CalendarHolidayNotice
        status={holidayDataStatus}
        visibleYear={visibleMonth.year}
      />

      <CalendarMenuSections
        exportingCalendar={exportingCalendar}
        includeNotesInExport={includeNotesInExport}
        isDark={isDark}
        legendExpanded={legendExpanded}
        onExportCalendar={() => void exportVisibleMonth()}
        onIncludeNotesChange={(include) => {
          includeNotesInExportRef.current = include;
          setIncludeNotesInExport(include);
        }}
        onToggleLegend={() => {
          setLegendExpanded((expanded) => !expanded);
          setSummaryExpanded(false);
        }}
        onToggleSummary={() => {
          setSummaryExpanded((expanded) => !expanded);
          setLegendExpanded(false);
        }}
        payPeriodSummary={payPeriodSummary}
        shiftTypes={data.shiftTypes}
        summaryExpanded={summaryExpanded}
      />

    </Screen>
  );
}

const screenStyles = StyleSheet.create({
  screen: {
    gap: spacing.medium,
    paddingTop: spacing.small,
  },
});
