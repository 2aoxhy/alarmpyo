import * as Haptics from 'expo-haptics';
import { createElement, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { formatKoreanDate, isValidDateKey } from '@/utils/date';
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
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [pickerFocused, setPickerFocused] = useState(false);
  const [manualEntryFocused, setManualEntryFocused] = useState(false);
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
    setManualEntryFocused(false);
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
        {createElement('input', {
          'aria-label': pickerAccessibilityLabel,
          max: '9999-12-31',
          onBlur: () => setPickerFocused(false),
          onChange: (event: { currentTarget: { value: string } }) => {
            void Haptics.selectionAsync();
            const nextValue = event.currentTarget.value;
            if (!bufferManualInput || isValidDateKey(nextValue)) commitDate(nextValue);
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
          accessibilityHint="날짜를 오늘로 변경합니다."
          label="오늘"
          onPress={() => commitDate(today)}
          size="compact"
          style={styles.todayButton}
          variant="secondary"
        />
      </View>

      {!showInputHelp ? (
        <AppText tone="secondary" style={styles.helpText} variant="caption">
          {formatKoreanDate(value, true)}
        </AppText>
      ) : (
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
      )}

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
          maxLength={10}
          onChangeText={changeManualEntry}
          onBlur={commitManualEntry}
          onFocus={() => setManualEntryFocused(true)}
          onSubmitEditing={commitManualEntry}
          placeholder={placeholder}
          placeholderTextColor={palette.inkSoft}
          selectTextOnFocus
          selectionColor={palette.indigo}
          style={[
            styles.dateInput,
            !manualInputValid && styles.inputError,
            manualEntryFocused && styles.inputFocused,
          ]}
          value={displayedManualInput}
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
