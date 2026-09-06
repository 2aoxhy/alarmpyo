import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { shape } from '@/design-system';
import { fontFamily } from '@/constants/typography';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  formatKoreanDate,
  isValidDateKey,
  parseDateKey,
  toDateKey,
} from '@/utils/date';
import {
  createCompactDateInputUpdate,
  formatCompactDateInputChange,
  normalizeCompactDateInput,
} from '@/utils/compact-date-input';

type DatePickerFieldProps = {
  accessibilityLabel: string;
  /** 직접 입력 중 partial/invalid 문자열을 외부 상태에 보내지 않습니다. */
  bufferManualInput?: boolean;
  onChange: (dateKey: string) => void;
  placeholder: string;
  today: string;
  value: string;
};

export function DatePickerField({
  accessibilityLabel,
  bufferManualInput = false,
  onChange,
  placeholder,
  today,
  value,
}: DatePickerFieldProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState(() => ({
    baseValue: value,
    input: value,
  }));
  const valid = isValidDateKey(value);
  const displayedManualInput =
    bufferManualInput && manualDraft.baseValue === value
      ? manualDraft.input
      : value;
  const compactInputResult = normalizeCompactDateInput(displayedManualInput);
  const manualInputValid = isValidDateKey(displayedManualInput);
  const showInputHelp =
    !valid || (bufferManualInput && manualEntryOpen && !manualInputValid);
  const pickerValue = valid ? parseDateKey(value) : parseDateKey(today);
  const pickerAccessibilityLabel = valid
    ? `${accessibilityLabel}, 현재 ${formatKoreanDate(value, true)}`
    : `${accessibilityLabel}, 날짜 미선택`;
  const changeManualEntry = (nextValue: string) => {
    if (!bufferManualInput) {
      onChange(formatCompactDateInputChange(nextValue));
      return;
    }
    const update = createCompactDateInputUpdate(nextValue);
    setManualDraft({ baseValue: value, input: update.input });
    if (update.dateKey && update.dateKey !== value) onChange(update.dateKey);
  };
  const commitManualEntry = () => {
    if (!bufferManualInput) {
      const result = normalizeCompactDateInput(value);
      if (result.valid && result.dateKey !== value) onChange(result.dateKey);
      return;
    }
    const update = createCompactDateInputUpdate(displayedManualInput, {
      finalize: true,
    });
    setManualDraft({ baseValue: value, input: update.input });
    if (update.dateKey && update.dateKey !== value) onChange(update.dateKey);
  };
  const commitDate = (nextValue: string) => {
    if (bufferManualInput) {
      setManualDraft({ baseValue: nextValue, input: nextValue });
    }
    onChange(nextValue);
  };

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
          onPress={() => commitDate(today)}
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
          accessibilityHint="2682, 260802 또는 20260802처럼 입력할 수 있습니다."
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          maxLength={10}
          onBlur={commitManualEntry}
          onChangeText={changeManualEntry}
          onSubmitEditing={commitManualEntry}
          placeholder={placeholder}
          placeholderTextColor={palette.inkSoft}
          selectTextOnFocus
          selectionColor={palette.indigo}
          style={[styles.dateInput, !manualInputValid && styles.inputError]}
          value={displayedManualInput}
        />
      ) : null}

      {showInputHelp ? (
        <View accessibilityLiveRegion="polite">
          <AppText
            color={compactInputResult.valid ? palette.inkSoft : palette.danger}
            style={styles.helpText}
            variant="caption">
            {compactInputResult.valid
              ? `입력을 마치면 ${compactInputResult.dateKey}로 적용됩니다.`
              : manualEntryOpen
                ? compactInputResult.error
                : '날짜를 선택하거나 직접 입력합니다.'}
          </AppText>
        </View>
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
            commitDate(toDateKey(date));
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
      borderRadius: shape.control,
      backgroundColor: palette.surfaceSoft,
    },
    pickerLabel: { flex: 1, minWidth: 0, textAlign: 'center' },
    todayButton: { minWidth: 76, minHeight: 48 },
    dateInput: {
      minHeight: 52,
      borderRadius: shape.control,
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
    pressed: { opacity: 0.68 },
  });
}
