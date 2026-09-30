import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { SelectionPill } from '@/components/selection-controls';
import { AppText, MenuGroup } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { SegmentedControl, shape } from '@/design-system';
import {
  formatDayAlarmOverrideSummary,
  formatWakeDayLabel,
  getDefaultWakeTime,
  resolveDayAlarmDraft,
  type DayAlarmDraft,
  type DayAlarmMode,
  type WakeDayOffset,
} from '@/features/day-editor/day-alarm-settings-model';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { DayExceptionType, ShiftType } from '@/models/app-data';
import { formatDuration } from '@/utils/date';
import { getDayExceptionAppearance } from '@/utils/day-exception-appearance';
import {
  formatTimeInput,
  formatTimeInputWhileTyping,
  normalizeTimeInput,
} from '@/utils/shift-time';
import { getShiftAppearance } from '@/utils/shift-appearance';

const MODE_OPTIONS: readonly { label: string; value: DayAlarmMode }[] = [
  { label: '기본', value: 'default' },
  { label: '끄기', value: 'disabled' },
  { label: '기상 시각', value: 'wake-time' },
];

type DayAlarmSummaryProps = {
  alarmDraft: DayAlarmDraft;
  alarmSourceShift: ShiftType;
  compact: boolean;
  dayException: DayExceptionType | null;
  notificationsEnabled: boolean;
  onChange: (draft: DayAlarmDraft) => void;
  showTitle?: boolean;
  usesDayAlarm: boolean;
};

export function DayAlarmSummary({
  alarmDraft,
  alarmSourceShift,
  compact,
  dayException,
  notificationsEnabled,
  onChange,
  showTitle = true,
  usesDayAlarm,
}: DayAlarmSummaryProps) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [timeFocused, setTimeFocused] = useState(false);
  const exceptionAppearance = dayException
    ? getDayExceptionAppearance(dayException, palette)
    : null;
  const shiftAppearance = getShiftAppearance(alarmSourceShift, palette, isDark);
  const appearance =
    usesDayAlarm && exceptionAppearance ? exceptionAppearance : shiftAppearance;
  const draftResult = resolveDayAlarmDraft(
    alarmDraft,
    alarmSourceShift.startMinutes,
  );
  const currentSummary = getCurrentSummary(
    alarmDraft,
    alarmSourceShift,
    draftResult,
  );

  const chooseMode = (mode: DayAlarmMode) => {
    if (mode === 'wake-time' && alarmDraft.mode !== 'wake-time') {
      const defaultWake = getDefaultWakeTime(alarmSourceShift);
      if (defaultWake) {
        onChange({
          mode,
          wakeTime: formatTimeInput(defaultWake.wakeMinutes),
          wakeDayOffset: defaultWake.wakeDayOffset,
        });
        return;
      }
    }
    onChange({ ...alarmDraft, mode });
  };
  const chooseWakeDay = (wakeDayOffset: WakeDayOffset) => {
    onChange({ ...alarmDraft, wakeDayOffset });
  };

  const content = (
    <View style={styles.card}>
        <View
          accessible
          accessibilityLabel={`현재 알람 설정. ${currentSummary}`}
          style={styles.summary}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.alarmRail, { backgroundColor: appearance.accentColor }]}
          />
          <View style={styles.optionCopy}>
            <AppText variant="label">{currentSummary}</AppText>
            <AppText tone="secondary" variant="caption">
              {notificationsEnabled
                ? '이날만 적용 · 기본 근무표 유지'
                : '전체 근무 알람 꺼짐 · 설정은 저장 가능'}
            </AppText>
          </View>
        </View>

        <SegmentedControl
          label="이 날짜의 근무 알람 방식"
          layout={compact ? 'stacked' : 'auto'}
          onChange={chooseMode}
          options={MODE_OPTIONS}
          value={alarmDraft.mode}
        />

        {alarmDraft.mode === 'wake-time' ? (
          <View style={styles.customTimeSection}>
            <AppText accessibilityRole="header" variant="label">
              기상 시각
            </AppText>
            <AppText tone="secondary" variant="caption">
              전날 또는 당일 선택
            </AppText>

            <View accessibilityRole="radiogroup" style={styles.dayChoiceRow}>
              {([-1, 0] as const).map((offset) => {
                const selected = alarmDraft.wakeDayOffset === offset;
                const label = formatWakeDayLabel(offset);
                return (
                  <SelectionPill
                    accessibilityLabel={`${label} 기상`}
                    icon={offset === -1 ? 'shift-night' : 'calendar-outline'}
                    key={offset}
                    onPress={() => chooseWakeDay(offset)}
                    selected={selected}
                    semanticColor={appearance.accentColor}
                    style={styles.dayChoice}
                    label={label}
                  />
                );
              })}
            </View>

            <View style={styles.timeField}>
              <AppText tone="secondary" variant="caption">
                기상 시각
              </AppText>
              <TextInput
                accessibilityHint="24시간 형식입니다. 0510 입력 시 05:10으로 바뀝니다."
                accessibilityLabel={`${formatWakeDayLabel(
                  alarmDraft.wakeDayOffset,
                )} 기상 시각`}
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                onBlur={() => {
                  setTimeFocused(false);
                  onChange({
                    ...alarmDraft,
                    wakeTime: normalizeTimeInput(alarmDraft.wakeTime),
                  });
                }}
                onChangeText={(wakeTime) =>
                  onChange({
                    ...alarmDraft,
                    wakeTime: formatTimeInputWhileTyping(wakeTime),
                  })
                }
                onFocus={() => setTimeFocused(true)}
                placeholder="05:10"
                placeholderTextColor={palette.inkSoft}
                selectTextOnFocus
                selectionColor={appearance.accentColor}
                style={[
                  styles.timeInput,
                  timeFocused && { borderColor: appearance.accentColor },
                  !draftResult.valid && styles.inputError,
                ]}
                value={alarmDraft.wakeTime}
              />
            </View>

            <View
              accessibilityLiveRegion="polite"
              style={[
                styles.validation,
                !draftResult.valid && styles.validationError,
              ]}>
              <AppIcon
                accessible={false}
                color={draftResult.valid ? palette.mintDark : palette.danger}
                name={draftResult.valid ? 'checkmark-circle' : 'alert-circle-outline'}
                size={19}
              />
              <AppText
                color={draftResult.valid ? palette.inkMuted : palette.danger}
                style={styles.validationCopy}
                variant="caption">
                {draftResult.valid && draftResult.leadMinutes !== null
                  ? `${formatWakeDayLabel(alarmDraft.wakeDayOffset)} ${normalizeTimeInput(
                      alarmDraft.wakeTime,
                    )} · 시작 ${formatDuration(draftResult.leadMinutes)} 전`
                  : draftResult.valid
                    ? '기상 시각 입력'
                    : draftResult.message}
              </AppText>
            </View>
          </View>
        ) : null}
    </View>
  );
  return showTitle ? (
    <MenuGroup centered title="근무 알람" style={styles.sectionGroup}>
      {content}
    </MenuGroup>
  ) : content;
}

function getCurrentSummary(
  draft: DayAlarmDraft,
  shift: ShiftType,
  result: ReturnType<typeof resolveDayAlarmDraft>,
) {
  if (draft.mode === 'default') {
    return shift.alarmEnabled
      ? formatDayAlarmOverrideSummary(null, shift)
      : `${shift.name} 기본 알람 꺼짐`;
  }
  if (draft.mode === 'disabled') return '이날만 알람 없음';
  if (!result.valid) return '기상 시각 확인 필요';
  return formatDayAlarmOverrideSummary(result.override, shift);
}

function createStyles(palette: AppPalette, isDark: boolean) {
  return StyleSheet.create({
    sectionGroup: { gap: spacing.small },
    card: {
      gap: spacing.medium,
      paddingVertical: spacing.small,
    },
    summary: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    alarmRail: { width: 3, height: 40, flexShrink: 0, borderRadius: 2 },
    optionCopy: { flex: 1, minWidth: 0, gap: 3 },
    customTimeSection: {
      gap: spacing.small,
      paddingTop: spacing.small,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    dayChoiceRow: { flexDirection: 'row', gap: spacing.small },
    dayChoice: { flex: 1 },
    timeField: { gap: spacing.small },
    timeInput: {
      width: '100%',
      minHeight: 52,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderRadius: shape.control,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      backgroundColor: isDark ? palette.surfaceSoft : palette.canvas,
      color: palette.ink,
      fontFamily: fontFamily.label,
      fontSize: 19,
      lineHeight: 25,
      textAlign: 'center',
      ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
    },
    inputError: { borderColor: palette.danger },
    validation: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      padding: spacing.small,
      borderRadius: shape.panel,
      backgroundColor: palette.mintSoft,
    },
    validationError: { backgroundColor: palette.dangerSoft },
    validationCopy: { flex: 1, minWidth: 0 },
  });
}
