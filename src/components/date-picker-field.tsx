import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  formatKoreanDate,
  isValidDateKey,
  parseDateKey,
  toDateKey,
} from '@/utils/date';

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const valid = isValidDateKey(value);
  const pickerValue = valid ? parseDateKey(value) : parseDateKey(today);
  const pickerAccessibilityLabel = valid
    ? `${accessibilityLabel}, 현재 ${formatKoreanDate(value, true)}`
    : `${accessibilityLabel}, 날짜 미선택`;

  return (
    <View style={styles.container}>
      <View style={styles.primaryRow}>
        <Pressable
          accessibilityHint="달력에서 날짜를 선택합니다."
          accessibilityLabel={pickerAccessibilityLabel}
          accessibilityRole="button"
          onPress={() => {
            void Haptics.selectionAsync();
            setPickerOpen(true);
          }}
          style={({ pressed }) => [
            styles.pickerButton,
            !valid && styles.inputError,
            pressed && styles.pressed,
          ]}>
          <AppIcon color={valid ? palette.indigo : palette.danger} name="calendar-outline" size={20} />
          <AppText
            color={valid ? palette.ink : palette.danger}
            numberOfLines={2}
            style={styles.pickerLabel}
            variant="label">
            {valid ? formatKoreanDate(value, true) : '날짜를 선택해야 합니다'}
          </AppText>
          <AppIcon color={palette.inkSoft} name="chevron-forward" size={18} />
        </Pressable>
        <AppButton
          accessibilityHint="날짜를 오늘로 변경합니다."
          label="오늘"
          onPress={() => onChange(today)}
          size="compact"
          style={styles.todayButton}
          variant="secondary"
        />
      </View>

      <AppButton
        accessibilityHint="연도-월-일 형식으로 날짜를 직접 입력합니다."
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
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={palette.inkSoft}
          selectTextOnFocus
          selectionColor={palette.indigo}
          style={[styles.dateInput, !valid && styles.inputError]}
          value={value}
        />
      ) : null}

      {!valid ? (
        <AppText color={palette.danger} style={styles.helpText} variant="caption">
          날짜를 달력에서 선택하거나 연도-월-일 형식으로 입력해야 합니다.
        </AppText>
      ) : null}

      {pickerOpen ? (
        <DateTimePicker
          accentColor={palette.indigo}
          display="calendar"
          mode="date"
          negativeButton={{ label: '뒤로 가기' }}
          onDismiss={() => setPickerOpen(false)}
          onValueChange={(_event, date) => {
            setPickerOpen(false);
            onChange(toDateKey(date));
          }}
          positiveButton={{ label: '선택하기' }}
          presentation="dialog"
          themeVariant="dark"
          value={pickerValue}
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
    pickerButton: {
      minWidth: 210,
      minHeight: 52,
      flexBasis: 220,
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.medium,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    pickerLabel: { flex: 1, minWidth: 0, textAlign: 'center' },
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
      ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
    },
    inputError: { borderColor: palette.danger },
    helpText: { textAlign: 'center' },
    pressed: { opacity: 0.68, transform: [{ scale: 0.99 }] },
  });
}
