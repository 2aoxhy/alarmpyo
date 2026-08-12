import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AnimatedShiftIcon, getShiftIconKind } from '@/components/animated-shift-icon';
import { AppText, Card } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import {
  DAY_SHIFT_END_MINUTES,
  NIGHT_SHIFT_END_MINUTES,
} from '@/constants/shift-schedule';
import { fontFamily } from '@/constants/typography';
import {
  AppField,
  SegmentedControl,
  StatusBanner,
  ToggleRow,
} from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ShiftType } from '@/models/app-data';
import { ROUTINE_ALARM_LEAD_MINUTES } from '@/services/work-routine-planner';
import { formatDuration } from '@/utils/date';
import {
  calculateAlarmMinutes,
  calculateShiftDuration,
  formatTimeInput,
  formatTimeInputWhileTyping,
  normalizeTimeInput,
  parseTimeInput,
} from '@/utils/shift-time';
import { getShiftAppearance } from '@/utils/shift-appearance';

import {
  ALARM_OPTIONS,
  formatAlarmOption,
  isNightShiftId,
  isSubstituteShiftId,
  type ShiftDraft,
} from './shift-settings-model';

function getWakeRoutineNote(minutes: number): string {
  const difference = minutes - ROUTINE_ALARM_LEAD_MINUTES;
  if (difference === 0) {
    return '등록한 출근 루틴의 기상 시각과 일치해요.';
  }
  if (difference > 0) {
    return `기본 출근 루틴보다 ${formatDuration(difference)} 일찍 울려요.`;
  }
  return `기본 출근 루틴보다 준비 시간이 ${formatDuration(Math.abs(difference))} 짧아요.`;
}

export function ShiftTimingEditor({
  compact,
  draft,
  emphasizeWake = false,
  onChange,
  onSubstituteModeChange,
  shift,
  substituteDayHasError = false,
  substituteMode,
  substituteNightHasError = false,
}: {
  compact: boolean;
  draft: ShiftDraft;
  emphasizeWake?: boolean;
  onChange: (patch: Partial<ShiftDraft>) => void;
  onSubstituteModeChange?: (mode: 'day' | 'night') => void;
  shift: ShiftType;
  substituteDayHasError?: boolean;
  substituteMode?: 'day' | 'night';
  substituteNightHasError?: boolean;
}) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const appearance = getShiftAppearance(shift, palette, isDark);
  const startMinutes = parseTimeInput(draft.start);
  const endMinutes = parseTimeInput(draft.end);
  const duration =
    startMinutes === null || endMinutes === null
      ? null
      : calculateShiftDuration(startMinutes, endMinutes);
  const alarmTime =
    startMinutes === null
      ? null
      : formatTimeInput(
          calculateAlarmMinutes(startMinutes, draft.alarmMinutesBefore),
        );
  const hasShortWakeLead =
    draft.alarmMinutesBefore < ROUTINE_ALARM_LEAD_MINUTES;
  const [focusedField, setFocusedField] = useState<'start' | 'end' | null>(
    null,
  );

  const timeErrorMessage =
    startMinutes === null || endMinutes === null
      ? '06:45 형식으로 입력해 주세요.'
      : !duration
        ? '시작과 종료 시간은 다르게 입력해 주세요.'
        : undefined;

  const renderWakeSettings = () => (
    <>
      <ToggleRow
        icon="alarm-outline"
        onValueChange={(alarmEnabled) => {
          void Haptics.selectionAsync();
          onChange({ alarmEnabled });
        }}
        subtitle="설정한 기상 시각을 수면 가이드와 출근 루틴에도 사용해요."
        title="기상 알람 울리기"
        value={draft.alarmEnabled}
      />

      <View style={styles.alarmSection}>
        <AppText accessibilityRole="header" variant="label">
          기상 시간
        </AppText>
        <AppText color={palette.inkMuted} variant="caption">
          실제 일어날 시각을 선택해요.
        </AppText>
        <View accessibilityRole="radiogroup" style={styles.alarmOptions}>
          {ALARM_OPTIONS.map((minutes) => {
            const selected = draft.alarmMinutesBefore === minutes;
            const optionTime =
              startMinutes === null
                ? null
                : formatTimeInput(
                    calculateAlarmMinutes(startMinutes, minutes),
                  );
            return (
              <Pressable
                key={minutes}
                accessibilityLabel={`${optionTime ?? '기상 시각 확인 필요'}, 근무 시작 ${formatDuration(minutes)} 전 기상`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onChange({ alarmMinutesBefore: minutes });
                }}
                style={({ pressed }) => [
                  styles.alarmOption,
                  compact && styles.alarmOptionCompact,
                  selected && {
                    backgroundColor: appearance.softColor,
                    borderColor: appearance.accentColor,
                  },
                  pressed && styles.pressed,
                ]}>
                <View style={styles.alarmOptionCopy}>
                  <AppText
                    color={selected ? appearance.accentColor : palette.ink}
                    style={styles.alarmOptionTime}
                    variant="label">
                    {optionTime ?? '--:--'}
                  </AppText>
                  <AppText
                    color={
                      selected ? appearance.accentColor : palette.inkMuted
                    }
                    style={styles.alarmOptionLabel}
                    variant="caption">
                    {formatAlarmOption(minutes)}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
        {alarmTime ? (
          <StatusBanner
            message={`${getWakeRoutineNote(draft.alarmMinutesBefore)}${!draft.alarmEnabled ? ' 알람을 꺼도 이 기상 시각은 유지돼요.' : ''}`}
            title={`${alarmTime} 기상 · 근무 시작 ${formatDuration(draft.alarmMinutesBefore)} 전`}
            tone={hasShortWakeLead ? 'warning' : 'info'}
          />
        ) : null}
      </View>
    </>
  );

  return (
    <Card style={styles.card}>
      {substituteMode && onSubstituteModeChange ? (
        <SegmentedControl
          label="대체근무 종류"
          onChange={(value) => {
            if (value === substituteMode) return;
            void Haptics.selectionAsync();
            onSubstituteModeChange(value);
          }}
          options={[
            {
              value: 'day',
              label: `주간 대체${substituteDayHasError ? ' · 확인 필요' : ''}`,
            },
            {
              value: 'night',
              label: `야간 대체${substituteNightHasError ? ' · 확인 필요' : ''}`,
            },
          ]}
          value={substituteMode}
        />
      ) : null}

      <View style={styles.header}>
        <View
          style={[
            styles.shiftIcon,
            { backgroundColor: appearance.softColor },
          ]}>
          <AnimatedShiftIcon
            active={focusedField !== null}
            color={appearance.accentColor}
            kind={getShiftIconKind(shift.id, shift.isOff)}
            size={28}
          />
        </View>
        <View style={styles.flexCopy}>
          <AppText accessibilityRole="header" variant="heading">
            {isSubstituteShiftId(shift.id)
              ? shift.name
              : `${shift.name} 근무`}
          </AppText>
          <AppText color={palette.inkMuted} variant="caption">
            근무 시간과 기상 시각을 설정해요.
          </AppText>
        </View>
      </View>

      {emphasizeWake ? renderWakeSettings() : null}

      {emphasizeWake ? <View style={styles.divider} /> : null}

      <View style={[styles.timeRow, compact && styles.timeRowCompact]}>
        <AppField
          accessibilityHint="24시간 형식으로 입력해 주세요."
          accessibilityLabel={`${shift.name} 시작 시간`}
          autoCorrect={false}
          containerStyle={styles.timeField}
          errorText={startMinutes === null ? '06:45 형식으로 입력해 주세요.' : undefined}
          inputMode="numeric"
          inputStyle={[
            styles.timeInput,
            focusedField === 'start' && {
              borderColor: appearance.accentColor,
            },
          ]}
          keyboardType="numbers-and-punctuation"
          label="시작 시간"
          maxLength={5}
          onBlur={() => {
            setFocusedField(null);
            onChange({ start: normalizeTimeInput(draft.start) });
          }}
          onChangeText={(start) =>
            onChange({ start: formatTimeInputWhileTyping(start) })
          }
          onFocus={() => setFocusedField('start')}
          placeholder={isNightShiftId(shift.id) ? '17:45' : '06:45'}
          selectTextOnFocus
          value={draft.start}
        />
        <AppField
          accessibilityHint="24시간 형식으로 입력해 주세요."
          accessibilityLabel={`${shift.name} 종료 시간`}
          autoCorrect={false}
          containerStyle={styles.timeField}
          errorText={endMinutes === null ? '17:45 형식으로 입력해 주세요.' : undefined}
          inputMode="numeric"
          inputStyle={[
            styles.timeInput,
            focusedField === 'end' && {
              borderColor: appearance.accentColor,
            },
          ]}
          keyboardType="numbers-and-punctuation"
          label="종료 시간"
          maxLength={5}
          onBlur={() => {
            setFocusedField(null);
            onChange({ end: normalizeTimeInput(draft.end) });
          }}
          onChangeText={(end) =>
            onChange({ end: formatTimeInputWhileTyping(end) })
          }
          onFocus={() => setFocusedField('end')}
          placeholder={
            isNightShiftId(shift.id)
              ? formatTimeInput(NIGHT_SHIFT_END_MINUTES)
              : formatTimeInput(DAY_SHIFT_END_MINUTES)
          }
          selectTextOnFocus
          value={draft.end}
        />
      </View>

      <StatusBanner
        message={
          duration
            ? `${draft.start}부터 ${duration.endsNextDay ? '다음 날 ' : ''}${draft.end}까지예요.`
            : (timeErrorMessage ?? '시간을 확인해 주세요.')
        }
        title={
          duration
            ? `총 ${formatDuration(duration.durationMinutes)} 근무`
            : '시간 확인 필요'
        }
        tone={duration ? 'success' : 'danger'}
      />

      {!emphasizeWake ? <View style={styles.divider} /> : null}
      {!emphasizeWake ? renderWakeSettings() : null}
    </Card>
  );
}

function createStyles(palette: AppPalette, isDark: boolean) {
  return StyleSheet.create({
    card: {
      gap: spacing.large,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    shiftIcon: {
      width: 50,
      height: 50,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
    },
    flexCopy: {
      minWidth: 0,
      flex: 1,
      gap: 3,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.medium,
    },
    timeRowCompact: {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    timeField: {
      minWidth: 0,
      flex: 1,
    },
    timeInput: {
      color: palette.ink,
      fontSize: 19,
      fontFamily: fontFamily.label,
      textAlign: 'center',
      backgroundColor: isDark ? palette.surfaceSoft : palette.canvas,
      ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: palette.line,
    },
    alarmSection: {
      gap: spacing.small,
    },
    alarmOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
    },
    alarmOption: {
      minHeight: 62,
      flexBasis: '30%',
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.small,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      borderRadius: radii.pill,
      backgroundColor: palette.surface,
    },
    alarmOptionCompact: {
      minHeight: 66,
      flexBasis: '46%',
    },
    alarmOptionCopy: {
      alignItems: 'center',
      gap: 1,
    },
    alarmOptionTime: {
      fontSize: 17,
      textAlign: 'center',
    },
    alarmOptionLabel: {
      textAlign: 'center',
    },
    pressed: {
      opacity: 0.68,
    },
  });
}
