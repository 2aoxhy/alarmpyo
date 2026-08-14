import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppText, Card, MenuGroup } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { SegmentedControl } from '@/design-system';
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
  { label: '기본값', value: 'default' },
  { label: '이날만 끄기', value: 'disabled' },
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
    <Card density="compact" style={styles.card}>
        <View
          accessible
          accessibilityLabel={`현재 알람 설정. ${currentSummary}`}
          style={styles.summary}>
          <View style={[styles.alarmIcon, { backgroundColor: appearance.softColor }]}>
            <AppIcon
              accessible={false}
              color={appearance.accentColor}
              name={alarmDraft.mode === 'disabled' ? 'notifications-off-outline' : 'alarm-outline'}
              size={21}
            />
          </View>
          <View style={styles.optionCopy}>
            <AppText variant="label">{currentSummary}</AppText>
            <AppText tone="secondary" variant="caption">
              {notificationsEnabled
                ? '이 날짜의 알람만 바꿔도 기본 근무표는 그대로 유지돼요.'
                : '전체 근무 알람이 꺼져 있어요. 설정은 저장해 둘 수 있어요.'}
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
              이날의 기상 시각
            </AppText>
            <AppText tone="secondary" variant="caption">
              근무일을 기준으로 전날인지 당일인지 먼저 선택해 주세요.
            </AppText>

            <View accessibilityRole="radiogroup" style={styles.dayChoiceRow}>
              {([-1, 0] as const).map((offset) => {
                const selected = alarmDraft.wakeDayOffset === offset;
                const label = formatWakeDayLabel(offset);
                return (
                  <Pressable
                    accessibilityLabel={`${label} 기상${selected ? ', 선택됨' : ''}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={offset}
                    onPress={() => chooseWakeDay(offset)}
                    style={({ pressed }) => [
                      styles.dayChoice,
                      selected && styles.dayChoiceSelected,
                      pressed && styles.pressed,
                    ]}>
                    <AppIcon
                      accessible={false}
                      color={selected ? appearance.accentColor : palette.inkMuted}
                      name={offset === -1 ? 'shift-night' : 'calendar-outline'}
                      size={18}
                    />
                    <AppText
                      color={selected ? appearance.accentColor : palette.inkMuted}
                      variant="label">
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.timeField}>
              <AppText tone="secondary" variant="caption">
                기상 시각
              </AppText>
              <TextInput
                accessibilityHint="24시간 형식으로 입력해 주세요. 0510을 입력하면 05:10으로 바뀌어요."
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
                    )} · 근무 시작 ${formatDuration(draftResult.leadMinutes)} 전이에요.`
                  : draftResult.valid
                    ? '기상 시각을 지정해 주세요.'
                    : draftResult.message}
              </AppText>
            </View>
          </View>
        ) : null}
    </Card>
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
    card: { gap: spacing.medium },
    summary: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    alarmIcon: {
      width: 46,
      height: 46,
      flexShrink: 0,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionCopy: { flex: 1, minWidth: 0, gap: 3 },
    customTimeSection: {
      gap: spacing.small,
      paddingTop: spacing.small,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    dayChoiceRow: { flexDirection: 'row', gap: spacing.small },
    dayChoice: {
      minWidth: 48,
      minHeight: 48,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.small,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    dayChoiceSelected: {
      borderColor: palette.indigo,
      backgroundColor: palette.indigoSoft,
    },
    timeField: { gap: spacing.small },
    timeInput: {
      width: '100%',
      minHeight: 52,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderRadius: radii.medium,
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
      borderRadius: radii.medium,
      backgroundColor: palette.mintSoft,
    },
    validationError: { backgroundColor: palette.dangerSoft },
    validationCopy: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.68 },
  });
}
