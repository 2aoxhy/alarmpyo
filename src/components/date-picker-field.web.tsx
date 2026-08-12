import * as Haptics from 'expo-haptics';
import { createElement, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { formatKoreanDate, isValidDateKey } from '@/utils/date';

type DatePickerFieldProps = {
  accessibilityLabel: string;
  onChange: (dateKey: string) => void;
  placeholder: string;
  today: string;
  value: string;
};

export function DatePickerField({
  accessibilityLabel,
  onChange,
  placeholder,
  today,
  value,
}: DatePickerFieldProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [pickerFocused, setPickerFocused] = useState(false);
  const [manualEntryFocused, setManualEntryFocused] = useState(false);
  const valid = isValidDateKey(value);
  const pickerAccessibilityLabel = valid
    ? `${accessibilityLabel}, 현재 ${formatKoreanDate(value, true)}`
    : `${accessibilityLabel}, 날짜 미선택`;

  return (
    <View style={styles.container}>
      <View style={styles.primaryRow}>
        {createElement('input', {
          'aria-label': pickerAccessibilityLabel,
          max: '9999-12-31',
          onBlur: () => setPickerFocused(false),
          onChange: (event: { currentTarget: { value: string } }) => {
            void Haptics.selectionAsync();
            onChange(event.currentTarget.value);
          },
          onFocus: () => setPickerFocused(true),
          style: {
            minWidth: 210,
            minHeight: 52,
            flex: '1 1 220px',
            border: `1.5px solid ${valid ? palette.controlLine : palette.danger}`,
            borderRadius: radii.medium,
            background: palette.canvas,
            padding: `0 ${spacing.medium}px`,
            color: palette.ink,
            colorScheme: 'dark',
            fontFamily: fontFamily.label,
            fontSize: 18,
            textAlign: 'center',
            outline: pickerFocused ? `3px solid ${palette.indigo}` : 'none',
            outlineOffset: 2,
          },
          type: 'date',
          value: valid ? value : '',
        })}
        <AppButton
          accessibilityHint="날짜를 오늘로 바꿔요."
          label="오늘"
          onPress={() => onChange(today)}
          size="compact"
          style={styles.todayButton}
          variant="secondary"
        />
      </View>

      {valid ? (
        <AppText color={palette.inkMuted} style={styles.helpText} variant="caption">
          {formatKoreanDate(value, true)}
        </AppText>
      ) : (
        <AppText color={palette.danger} style={styles.helpText} variant="caption">
          날짜를 달력에서 선택해 주세요.
        </AppText>
      )}

      <AppButton
        accessibilityHint="연도-월-일 형식으로 날짜를 직접 입력해요."
        icon="options-outline"
        label={manualEntryOpen ? '직접 입력 닫기' : '직접 입력'}
        onPress={() => setManualEntryOpen((open) => !open)}
        size="compact"
        variant="ghost"
      />

      {manualEntryOpen ? (
        <TextInput
          accessibilityLabel={`${accessibilityLabel} 직접 입력`}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={10}
          onChangeText={onChange}
          onBlur={() => setManualEntryFocused(false)}
          onFocus={() => setManualEntryFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={palette.inkSoft}
          selectTextOnFocus
          selectionColor={palette.indigo}
          style={[
            styles.dateInput,
            !valid && styles.inputError,
            manualEntryFocused && styles.inputFocused,
          ]}
          value={value}
        />
      ) : null}
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    container: { gap: spacing.small },
    primaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.small,
    },
    todayButton: { minWidth: 76, minHeight: 48 },
    dateInput: {
      minHeight: 52,
      borderRadius: radii.medium,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      backgroundColor: palette.surfaceSoft,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      color: palette.ink,
      fontSize: 18,
      fontFamily: fontFamily.label,
      letterSpacing: 1,
      textAlign: 'center',
      outlineWidth: 0,
    },
    inputError: { borderColor: palette.danger },
    inputFocused: {
      borderColor: palette.indigo,
      borderWidth: 2,
      outlineColor: palette.indigo,
      outlineWidth: 2,
    },
    helpText: { textAlign: 'center' },
  });
}
