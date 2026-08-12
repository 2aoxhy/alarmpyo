import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ShiftType } from '@/models/app-data';
import { formatDuration } from '@/utils/date';
import {
  formatTimeInputWhileTyping,
  normalizeTimeInput,
  type ShiftDuration,
} from '@/utils/shift-time';
import { getShiftAppearance } from '@/utils/shift-appearance';

type ShiftTimeEditorProps = {
  compact: boolean;
  endTime: string;
  onEndTimeChange: (value: string) => void;
  onReset: () => void;
  onStartTimeChange: (value: string) => void;
  parsedEndMinutes: number | null;
  parsedStartMinutes: number | null;
  selectedDuration: ShiftDuration | null;
  selectedShift: ShiftType;
  startTime: string;
  usesDefaultTime: boolean;
};

export function ShiftTimeEditor({
  compact,
  endTime,
  onEndTimeChange,
  onReset,
  onStartTimeChange,
  parsedEndMinutes,
  parsedStartMinutes,
  selectedDuration,
  selectedShift,
  startTime,
  usesDefaultTime,
}: ShiftTimeEditorProps) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [focusedTime, setFocusedTime] = useState<'start' | 'end' | null>(null);
  const appearance = getShiftAppearance(selectedShift, palette, isDark);

  return (
    <Card density="compact" style={styles.timeCard}>
      <View style={styles.timeHeader}>
        <View style={[styles.timeIcon, { backgroundColor: appearance.softColor }]}>
          <AppIcon
            accessible={false}
            color={appearance.accentColor}
            name="time-outline"
            size={23}
          />
        </View>
        <View style={styles.optionCopy}>
          <AppText accessibilityRole="header" variant="heading">
            이 날짜의 근무 시간
          </AppText>
          <AppText color={palette.inkMuted} variant="caption">
            이날만 적용되며 알람도 자동으로 다시 계산돼요.
          </AppText>
        </View>
        {!usesDefaultTime ? (
          <AppButton
            accessibilityLabel="기본 시간으로 되돌리기"
            label="기본 시간"
            onPress={onReset}
            size="compact"
            style={styles.resetTimeButton}
            variant="ghost"
          />
        ) : null}
      </View>

      <View style={[styles.timeRow, compact && styles.timeRowCompact]}>
        <View style={styles.timeField}>
          <AppText color={palette.inkMuted} variant="caption">
            시작 시간
          </AppText>
          <TextInput
            accessibilityHint="24시간 형식으로 입력해 주세요."
            accessibilityLabel={`${selectedShift.name} 시작 시간`}
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            onBlur={() => {
              setFocusedTime(null);
              onStartTimeChange(normalizeTimeInput(startTime));
            }}
            onChangeText={(value) =>
              onStartTimeChange(formatTimeInputWhileTyping(value))
            }
            onFocus={() => setFocusedTime('start')}
            placeholder="06:45"
            placeholderTextColor={palette.inkSoft}
            selectTextOnFocus
            selectionColor={appearance.accentColor}
            style={[
              styles.timeInput,
              focusedTime === 'start' && { borderColor: appearance.accentColor },
              parsedStartMinutes === null && styles.inputError,
            ]}
            value={startTime}
          />
        </View>
        <View style={compact && styles.verticalArrow}>
          <AppIcon
            accessible={false}
            color={palette.inkSoft}
            name="arrow-forward"
            size={20}
          />
        </View>
        <View style={styles.timeField}>
          <AppText color={palette.inkMuted} variant="caption">
            종료 시간
          </AppText>
          <TextInput
            accessibilityHint="24시간 형식으로 입력해 주세요."
            accessibilityLabel={`${selectedShift.name} 종료 시간`}
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            onBlur={() => {
              setFocusedTime(null);
              onEndTimeChange(normalizeTimeInput(endTime));
            }}
            onChangeText={(value) =>
              onEndTimeChange(formatTimeInputWhileTyping(value))
            }
            onFocus={() => setFocusedTime('end')}
            placeholder="17:45"
            placeholderTextColor={palette.inkSoft}
            selectTextOnFocus
            selectionColor={appearance.accentColor}
            style={[
              styles.timeInput,
              focusedTime === 'end' && { borderColor: appearance.accentColor },
              parsedEndMinutes === null && styles.inputError,
            ]}
            value={endTime}
          />
        </View>
      </View>

      <View
        accessibilityLiveRegion="polite"
        style={[styles.durationSummary, !selectedDuration && styles.durationError]}>
        <AppIcon
          accessible={false}
          color={selectedDuration ? palette.mintDark : palette.danger}
          name={selectedDuration ? 'time-outline' : 'alert-circle-outline'}
          size={21}
        />
        <View style={styles.optionCopy}>
          <AppText
            color={selectedDuration ? palette.ink : palette.danger}
            variant="label">
            {selectedDuration
              ? `총 ${formatDuration(selectedDuration.durationMinutes)} 근무`
              : '시간 확인 필요'}
          </AppText>
          <AppText
            color={selectedDuration ? palette.inkMuted : palette.danger}
            variant="caption">
            {selectedDuration
              ? `${startTime}부터 ${
                  selectedDuration.endsNextDay ? '다음 날 ' : ''
                }${endTime}까지예요.`
              : parsedStartMinutes !== null && parsedEndMinutes !== null
                ? '시작과 종료 시간은 같을 수 없어요.'
                : '06:45 형식으로 정확히 입력해 주세요.'}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

function createStyles(palette: AppPalette, isDark: boolean) {
  return StyleSheet.create({
    optionCopy: { flex: 1, minWidth: 0, gap: 3 },
    timeCard: { gap: spacing.medium },
    timeHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.medium,
    },
    timeIcon: {
      width: 46,
      height: 46,
      flexShrink: 0,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resetTimeButton: { alignSelf: 'center' },
    timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.small },
    timeRowCompact: { flexDirection: 'column', alignItems: 'stretch' },
    timeField: { flex: 1, gap: spacing.small },
    verticalArrow: { alignSelf: 'center', transform: [{ rotate: '90deg' }] },
    timeInput: {
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
    durationSummary: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
      padding: spacing.medium,
      borderRadius: radii.medium,
      backgroundColor: palette.mintSoft,
    },
    durationError: { backgroundColor: palette.dangerSoft },
  });
}
