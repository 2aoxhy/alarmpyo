import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { shape } from '@/design-system';
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
  showHeader?: boolean;
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
  showHeader = true,
  startTime,
  usesDefaultTime,
}: ShiftTimeEditorProps) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [focusedTime, setFocusedTime] = useState<'start' | 'end' | null>(null);
  const appearance = getShiftAppearance(selectedShift, palette, isDark);

  return (
    <View style={styles.timeCard}>
      {showHeader ? <View style={styles.timeHeader}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.timeRail, { backgroundColor: appearance.accentColor }]}
        />
        <View style={styles.optionCopy}>
          <AppText accessibilityRole="header" variant="heading">
            근무 시간
          </AppText>
          <AppText tone="secondary" variant="caption">
            이날만 변경 · 알람 시각 자동 계산
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
      </View> : null}

      <View style={[styles.timeRow, compact && styles.timeRowCompact]}>
        <View style={styles.timeField}>
          <AppText tone="secondary" variant="caption">
            시작 시간
          </AppText>
          <TextInput
            accessibilityHint="24시간 형식입니다."
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
          <AppText tone="secondary" variant="caption">
            종료 시간
          </AppText>
          <TextInput
            accessibilityHint="24시간 형식입니다."
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
              ? `${startTime}–${
                  selectedDuration.endsNextDay ? '다음 날 ' : ''
                }${endTime}`
              : parsedStartMinutes !== null && parsedEndMinutes !== null
                ? '시작·종료 시간은 서로 다르게 입력'
                : '06:45 형식으로 입력'}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function createStyles(palette: AppPalette, isDark: boolean) {
  return StyleSheet.create({
    optionCopy: { flex: 1, minWidth: 0, gap: 3 },
    timeCard: { gap: spacing.medium, paddingVertical: spacing.small },
    timeHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.medium,
    },
    timeRail: { width: 3, height: 40, flexShrink: 0, borderRadius: 2 },
    resetTimeButton: { alignSelf: 'center' },
    timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.small },
    timeRowCompact: { flexDirection: 'column', alignItems: 'stretch' },
    timeField: { flex: 1, gap: spacing.small },
    verticalArrow: { alignSelf: 'center', transform: [{ rotate: '90deg' }] },
    timeInput: {
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
    durationSummary: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
      paddingVertical: spacing.medium,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    durationError: { borderTopColor: palette.danger },
  });
}
