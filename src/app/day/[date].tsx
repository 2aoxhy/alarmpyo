import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { AdditionalSettingsSection } from '@/features/day-editor/additional-settings-section';
import {
  areDayAlarmOverridesEqual,
  createDayAlarmDraft,
  formatDayAlarmOverrideSummary,
  resolveDayAlarmDraft,
  type DayAlarmDraft,
} from '@/features/day-editor/day-alarm-settings-model';
import {
  buildAdditionalSettingsSummary,
  shouldExpandAdditionalSettings,
} from '@/features/day-editor/additional-settings-summary';
import { DayAlarmSummary } from '@/features/day-editor/day-alarm-summary';
import {
  SUBSTITUTE_DAY_ID,
  SUBSTITUTE_NIGHT_ID,
  type DaySelection,
  type SubstituteMode,
} from '@/features/day-editor/day-editor-types';
import { DayNoteEditor } from '@/features/day-editor/day-note-editor';
import { ShiftSelectionSection } from '@/features/day-editor/shift-selection-section';
import { ShiftTimeEditor } from '@/features/day-editor/shift-time-editor';
import { SpecialScheduleSection } from '@/features/day-editor/special-schedule-section';
import { DisclosureRow } from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type {
  DayAlarmOverride,
  DayExceptionType,
  ShiftType,
} from '@/models/app-data';
import {
  getScheduleStartDate,
  resolveEffectiveDayFromAppData,
} from '@/services/app-data-service';
import { resolveShiftFromData, useAppStore } from '@/store/app-store';
import {
  formatKoreanDate,
  isValidDateKey,
  toDateKey,
} from '@/utils/date';
import { getDayExceptionAppearance } from '@/utils/day-exception-appearance';
import { usesDayAlarmForException } from '@/utils/day-exception';
import {
  calculateShiftDuration,
  formatTimeInput,
  parseTimeInput,
} from '@/utils/shift-time';

type AdditionalPanel = 'exception' | 'time' | 'alarm' | 'note';

export default function DayEditorScreen() {
  const { showDialog } = useAppDialog();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const compactTimeFields = width < 360 || fontScale >= 1.25;
  const params = useLocalSearchParams<{ date?: string }>();
  const navigation = useNavigation();
  const allowNavigation = useRef(false);
  const dateIsValid = isValidDateKey(params.date ?? '');
  const dateKey = dateIsValid ? (params.date as string) : toDateKey(new Date());
  const { data, getNoteForDate, saveDay } = useAppStore();
  const scheduleStartDate = getScheduleStartDate(data);
  const beforeScheduleStart = dateKey < scheduleStartDate;
  const hasOverride = Object.prototype.hasOwnProperty.call(data.overrides, dateKey);
  const storedDayException = data.dayExceptions[dateKey] ?? null;
  const [initialSelection] = useState<DaySelection>(() =>
    hasOverride ? data.overrides[dateKey] : 'pattern',
  );
  const patternShift = resolveShiftFromData(
    { ...data, overrides: {}, timeOverrides: {}, dayExceptions: {} },
    dateKey,
  );
  const shiftForSelection = (value: DaySelection): ShiftType | null => {
    if (value === 'pattern') return patternShift;
    if (value === null) return null;
    return data.shiftTypes.find((shift) => shift.id === value) ?? null;
  };
  const [initialTime] = useState(() => {
    const shift = shiftForSelection(initialSelection);
    const saved = data.timeOverrides[dateKey];
    if (
      !shift ||
      shift.isOff ||
      shift.startMinutes === null ||
      shift.endMinutes === null
    ) {
      return { start: '', end: '' };
    }
    if (saved?.shiftTypeId === shift.id) {
      return {
        start: formatTimeInput(saved.startMinutes),
        end: formatTimeInput(saved.endMinutes),
      };
    }
    return {
      start: formatTimeInput(shift.startMinutes),
      end: formatTimeInput(shift.endMinutes),
    };
  });
  const [initialAlarmOverride] = useState<DayAlarmOverride | null>(
    () => data.alarmOverrides[dateKey] ?? null,
  );
  const [initialAlarmDraft] = useState<DayAlarmDraft>(() =>
    createDayAlarmDraft(
      initialAlarmOverride,
      resolveEffectiveDayFromAppData(data, dateKey).shift,
    ),
  );
  const [selection, setSelection] = useState<DaySelection>(initialSelection);
  const [startTime, setStartTime] = useState(initialTime.start);
  const [endTime, setEndTime] = useState(initialTime.end);
  const [substituteMode, setSubstituteMode] = useState<SubstituteMode>(() =>
    hasOverride && data.overrides[dateKey] === SUBSTITUTE_NIGHT_ID ? 'night' : 'day',
  );
  const [initialNote] = useState(() => getNoteForDate(dateKey));
  const [note, setNote] = useState(initialNote);
  const [initialException] = useState<DayExceptionType | null>(
    () => storedDayException,
  );
  const [dayException, setDayException] = useState<DayExceptionType | null>(
    initialException,
  );
  const [alarmDraft, setAlarmDraft] = useState<DayAlarmDraft>(initialAlarmDraft);
  const [additionalSettingsExpanded, setAdditionalSettingsExpanded] = useState(
    () =>
      shouldExpandAdditionalSettings({
        hasException: Boolean(storedDayException),
        hasAlarmOverride: Boolean(initialAlarmOverride),
        hasTimeOverride: Boolean(data.timeOverrides[dateKey]),
        note: initialNote,
      }),
  );
  const [additionalPanel, setAdditionalPanel] = useState<AdditionalPanel | null>(
    () =>
      storedDayException
        ? 'exception'
        : data.timeOverrides[dateKey]
          ? 'time'
          : initialAlarmOverride
            ? 'alarm'
            : initialNote.trim()
              ? 'note'
              : null,
  );
  const [saving, setSaving] = useState(false);
  const selectedShift = shiftForSelection(selection);
  const parsedStartMinutes = parseTimeInput(startTime);
  const parsedEndMinutes = parseTimeInput(endTime);
  const selectedDuration =
    parsedStartMinutes === null || parsedEndMinutes === null
      ? null
      : calculateShiftDuration(parsedStartMinutes, parsedEndMinutes);
  const timeRequired = Boolean(selectedShift && !selectedShift.isOff);
  const timeIsValid = !timeRequired || selectedDuration !== null;
  const usesDefaultTime = Boolean(
    selectedShift &&
      selectedDuration &&
      parsedStartMinutes === selectedShift.startMinutes &&
      parsedEndMinutes === selectedShift.endMinutes,
  );
  const effectiveSelectedShift = selectedShift?.isOff
    ? selectedShift
    : selectedShift &&
        selectedDuration &&
        parsedStartMinutes !== null &&
        parsedEndMinutes !== null
      ? {
          ...selectedShift,
          startMinutes: parsedStartMinutes,
          endMinutes: parsedEndMinutes,
          endsNextDay: selectedDuration.endsNextDay,
        }
      : null;
  const selectedExceptionAppearance = dayException
    ? getDayExceptionAppearance(dayException, palette)
    : null;
  const usesDayAlarm = usesDayAlarmForException(dayException);
  const alarmSourceShift = resolveEffectiveDayFromAppData(data, dateKey, {
    scheduledShift: effectiveSelectedShift,
    dayException,
  }).shift;
  const alarmDraftResult = resolveDayAlarmDraft(
    alarmDraft,
    alarmSourceShift?.startMinutes ?? null,
  );
  const alarmOverrideForSave =
    alarmSourceShift && !alarmSourceShift.isOff && alarmDraftResult.valid
      ? alarmDraftResult.override
      : null;
  const alarmDraftChanged =
    alarmDraft.mode !== initialAlarmDraft.mode ||
    alarmDraft.wakeTime !== initialAlarmDraft.wakeTime ||
    alarmDraft.wakeDayOffset !== initialAlarmDraft.wakeDayOffset;
  const alarmOverrideChanged = alarmDraftResult.valid
    ? !areDayAlarmOverridesEqual(initialAlarmOverride, alarmOverrideForSave)
    : alarmDraftChanged;
  const hasChanges =
    selection !== initialSelection ||
    startTime !== initialTime.start ||
    endTime !== initialTime.end ||
    dayException !== initialException ||
    alarmOverrideChanged ||
    note.trim() !== initialNote.trim();
  const additionalSettingsSummary = buildAdditionalSettingsSummary({
    exceptionLabel: selectedExceptionAppearance?.label,
    hasAlarmOverride:
      alarmDraft.mode !== 'default' || Boolean(initialAlarmOverride),
    hasTimeOverride: Boolean(timeRequired && !usesDefaultTime),
    hasNote: note.trim().length > 0,
  });
  const timeSettingsSummary =
    selectedShift && !selectedShift.isOff && dayException === null
      ? `${startTime || '--:--'}~${endTime || '--:--'} · ${
          usesDefaultTime ? '기본 시간' : '이날만 변경'
        }`
      : '현재 일정에는 근무 시간이 없습니다.';
  const alarmSettingsSummary =
    !alarmSourceShift || alarmSourceShift.isOff
      ? '현재 일정에는 근무 알람이 없습니다.'
      : !alarmDraftResult.valid
        ? '기상 시각 확인 필요'
        : formatDayAlarmOverrideSummary(
            alarmOverrideForSave,
            alarmSourceShift,
          );

  const toggleAdditionalPanel = (panel: AdditionalPanel) => {
    void Haptics.selectionAsync();
    setAdditionalPanel((current) => (current === panel ? null : panel));
  };

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (saving && !allowNavigation.current) {
          event.preventDefault();
          return;
        }
        if (!hasChanges || allowNavigation.current) return;
        event.preventDefault();
        showDialog(
          '저장하지 않고 나가시겠습니까?',
          '선택한 근무, 예외 일정, 변경한 시간과 작성한 메모가 사라집니다.',
          [
            {
              text: '계속 편집하기',
              actionId: 'cancel',
              icon: 'close',
              style: 'cancel',
            },
            {
              text: '저장하지 않고 나가기',
              actionId: 'delete',
              icon: 'trash-outline',
              style: 'destructive',
              onPress: () => {
                allowNavigation.current = true;
                navigation.dispatch(event.data.action);
              },
            },
          ],
          { tone: 'danger' },
        );
      }),
    [hasChanges, navigation, saving, showDialog],
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/calendar');
  };
  const showFallbackNavigation = !router.canGoBack();

  if (!dateIsValid) {
    return (
      <Screen
        scroll={false}
        contentStyle={styles.invalidDate}
        safeAreaEdges={['left', 'right']}
        footer={
          showFallbackNavigation ? (
            <AppButton
              label="근무표로 돌아가기"
              onPress={goBack}
              size="compact"
            />
          ) : undefined
        }>
        <View style={styles.invalidDateIcon}>
          <AppIcon color={palette.danger} name="calendar-outline" size={30} />
        </View>
        <AppText accessibilityRole="header" variant="title">
          날짜를 열 수 없습니다
        </AppText>
        <AppText tone="secondary" style={styles.invalidDateText}>
          달력에서 날짜를 다시 선택해야 합니다.
        </AppText>
      </Screen>
    );
  }

  if (beforeScheduleStart) {
    return (
      <Screen
        scroll={false}
        contentStyle={styles.invalidDate}
        safeAreaEdges={['left', 'right']}
        footer={
          showFallbackNavigation ? (
            <AppButton label="근무표로 돌아가기" onPress={goBack} size="compact" />
          ) : undefined
        }>
        <View style={styles.invalidDateIcon}>
          <AppIcon color={palette.indigo} name="calendar-outline" size={30} />
        </View>
        <AppText accessibilityRole="header" variant="title">
          일정 적용 시작일 이전입니다
        </AppText>
        <AppText tone="secondary" style={styles.invalidDateText}>
          {formatKoreanDate(scheduleStartDate, true)}부터 일정이 시작됩니다. 이전 날짜에는
          근무와 알람을 만들지 않습니다.
        </AppText>
      </Screen>
    );
  }

  const timeForSelection = (value: DaySelection) => {
    if (value === initialSelection) return initialTime;
    const shift = shiftForSelection(value);
    if (
      !shift ||
      shift.isOff ||
      shift.startMinutes === null ||
      shift.endMinutes === null
    ) {
      return { start: '', end: '' };
    }
    return {
      start: formatTimeInput(shift.startMinutes),
      end: formatTimeInput(shift.endMinutes),
    };
  };

  const choose = (value: DaySelection) => {
    void Haptics.selectionAsync();
    if (dayException !== null) setDayException(null);
    if (value === selection) return;
    setSelection(value);
    const nextTime = timeForSelection(value);
    setStartTime(nextTime.start);
    setEndTime(nextTime.end);
  };

  const chooseSubstituteMode = (mode: SubstituteMode) => {
    void Haptics.selectionAsync();
    if (dayException !== null) setDayException(null);
    setSubstituteMode(mode);
    const value = mode === 'night' ? SUBSTITUTE_NIGHT_ID : SUBSTITUTE_DAY_ID;
    setSelection(value);
    const nextTime = timeForSelection(value);
    setStartTime(nextTime.start);
    setEndTime(nextTime.end);
  };

  const chooseDayException = (value: DayExceptionType | null) => {
    void Haptics.selectionAsync();
    setDayException(value);
  };

  const resetTime = () => {
    if (
      !selectedShift ||
      selectedShift.isOff ||
      selectedShift.startMinutes === null ||
      selectedShift.endMinutes === null
    ) {
      return;
    }
    void Haptics.selectionAsync();
    setStartTime(formatTimeInput(selectedShift.startMinutes));
    setEndTime(formatTimeInput(selectedShift.endMinutes));
  };

  const save = async () => {
    if (saving) return;
    if (
      dayException === null &&
      (!timeIsValid ||
        (timeRequired && (parsedStartMinutes === null || parsedEndMinutes === null)))
    ) {
      setAdditionalSettingsExpanded(true);
      setAdditionalPanel('time');
      showDialog(
        '근무 시간을 확인해야 합니다',
        '시작과 종료 시간을 06:45 형식으로 입력하고 서로 다르게 지정해야 합니다.',
      );
      return;
    }
    if (alarmSourceShift && !alarmSourceShift.isOff && !alarmDraftResult.valid) {
      setAdditionalSettingsExpanded(true);
      setAdditionalPanel('alarm');
      showDialog('기상 시각을 확인해야 합니다', alarmDraftResult.message);
      return;
    }
    setSaving(true);
    try {
      const storedTimeOverride = data.timeOverrides[dateKey];
      const timeOverride = usesDayAlarm
        ? storedTimeOverride && selectedShift?.id === storedTimeOverride.shiftTypeId
          ? {
              startMinutes: storedTimeOverride.startMinutes,
              endMinutes: storedTimeOverride.endMinutes,
            }
          : null
        : timeRequired &&
            !usesDefaultTime &&
            parsedStartMinutes !== null &&
            parsedEndMinutes !== null
          ? { startMinutes: parsedStartMinutes, endMinutes: parsedEndMinutes }
          : null;
      const saved = await saveDay(
        dateKey,
        selection,
        note,
        timeOverride,
        dayException,
        alarmOverrideForSave,
      );
      if (!saved) {
        showDialog(
          '일정을 저장하지 못했습니다',
          '휴대폰 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
        );
        return;
      }
      allowNavigation.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      contentStyle={styles.screen}
      safeAreaEdges={['left', 'right']}
      footer={
        <AppButton
          accessibilityHint={
            dayException === null && !timeIsValid
              ? '특별 일정·시간·알람·메모에서 근무 시간을 확인해야 합니다.'
              : '이 날짜의 변경 내용을 저장합니다.'
          }
          disabled={saving || !hasChanges}
          icon="checkmark"
          label={dayException === null && !timeIsValid ? '시간 확인하기' : '저장하기'}
          loading={saving}
          onPress={() => void save()}
        />
      }>
      <AppText
        accessibilityLabel={`선택한 날짜 ${formatKoreanDate(dateKey, true)}`}
        style={styles.dateTitle}
        variant="heading">
        {formatKoreanDate(dateKey, true)}
      </AppText>

      <ShiftSelectionSection
        compact={compactTimeFields}
        onChoose={choose}
        onChooseSubstituteMode={chooseSubstituteMode}
        patternShift={patternShift}
        selection={selection}
        shiftTypes={data.shiftTypes}
        substituteMode={substituteMode}
      />

      <AdditionalSettingsSection
        expanded={additionalSettingsExpanded}
        onToggle={() => {
          void Haptics.selectionAsync();
          setAdditionalSettingsExpanded((value) => !value);
        }}
        summary={additionalSettingsSummary}>
        <DisclosureRow
          expanded={additionalPanel === 'exception'}
          icon="options-outline"
          onPress={() => toggleAdditionalPanel('exception')}
          subtitle={selectedExceptionAppearance?.label ?? '없음'}
          title="특별 일정"
        />
        {additionalPanel === 'exception' ? (
          <SpecialScheduleSection
            dayException={dayException}
            onChange={chooseDayException}
            showTitle={false}
          />
        ) : null}

        <DisclosureRow
          disabled={!selectedShift || selectedShift.isOff || dayException !== null}
          expanded={additionalPanel === 'time'}
          icon="time-outline"
          onPress={() => toggleAdditionalPanel('time')}
          subtitle={timeSettingsSummary}
          title="근무 시간"
        />
        {additionalPanel === 'time' &&
        selectedShift &&
        !selectedShift.isOff &&
        dayException === null ? (
            <ShiftTimeEditor
              compact={compactTimeFields}
              endTime={endTime}
              onEndTimeChange={setEndTime}
              onReset={resetTime}
              onStartTimeChange={setStartTime}
              parsedEndMinutes={parsedEndMinutes}
              parsedStartMinutes={parsedStartMinutes}
              selectedDuration={selectedDuration}
              selectedShift={selectedShift}
              showHeader={false}
              startTime={startTime}
              usesDefaultTime={usesDefaultTime}
            />
          ) : null}

        <DisclosureRow
          disabled={!alarmSourceShift || alarmSourceShift.isOff}
          expanded={additionalPanel === 'alarm'}
          icon="alarm-outline"
          onPress={() => toggleAdditionalPanel('alarm')}
          subtitle={alarmSettingsSummary}
          title="근무 알람"
        />
        {additionalPanel === 'alarm' && alarmSourceShift && !alarmSourceShift.isOff ? (
            <DayAlarmSummary
              alarmDraft={alarmDraft}
              alarmSourceShift={alarmSourceShift}
              compact={compactTimeFields}
              dayException={dayException}
              notificationsEnabled={data.settings.notificationsEnabled}
              onChange={setAlarmDraft}
              showTitle={false}
              usesDayAlarm={usesDayAlarm}
            />
          ) : null}

        <DisclosureRow
          expanded={additionalPanel === 'note'}
          icon="book-outline"
          onPress={() => toggleAdditionalPanel('note')}
          subtitle={note.trim() ? `${note.trim().length}자 작성됨` : '없음'}
          title="메모"
        />
        {additionalPanel === 'note' ? (
          <DayNoteEditor note={note} onChange={setNote} showTitle={false} />
        ) : null}
      </AdditionalSettingsSection>
    </Screen>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screen: { gap: spacing.large, paddingTop: spacing.small },
    invalidDate: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    invalidDateIcon: {
      width: 60,
      height: 60,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.dangerSoft,
    },
    invalidDateText: { textAlign: 'center' },
    dateTitle: { width: '100%', textAlign: 'center' },
  });
}
