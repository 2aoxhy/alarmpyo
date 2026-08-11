import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { radius, size, space, typeScale } from './tokens';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type AppFieldProps = Omit<
  TextInputProps,
  'style' | 'placeholderTextColor'
> &
  DesignSystemThemeProps & {
    label: string;
    helperText?: string;
    errorText?: string;
    required?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
    inputStyle?: StyleProp<TextStyle>;
  };

export function AppField({
  label,
  helperText,
  errorText,
  required = false,
  containerStyle,
  inputStyle,
  theme,
  editable = true,
  accessibilityLabel,
  accessibilityHint,
  onBlur,
  onFocus,
  ...inputProps
}: AppFieldProps) {
  const { colors } = useDesignSystemTheme(theme);
  const [focused, setFocused] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const supportingText = errorText ?? helperText;

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        {...inputProps}
        accessibilityHint={accessibilityHint ?? supportingText}
        accessibilityLabel={accessibilityLabel ?? label}
        aria-invalid={Boolean(errorText)}
        editable={editable}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={colors.textSoft}
        selectionColor={colors.accent}
        style={[
          styles.input,
          focused && styles.inputFocused,
          Boolean(errorText) && styles.inputError,
          !editable && styles.inputDisabled,
          inputStyle,
        ]}
      />
      {supportingText ? (
        <Text
          accessibilityLiveRegion={errorText ? 'assertive' : 'polite'}
          style={[styles.supporting, errorText && styles.supportingError]}>
          {supportingText}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    container: {
      width: '100%',
      gap: space.sm,
    },
    label: {
      ...typeScale.label,
      color: colors.text,
    },
    required: {
      color: colors.danger,
    },
    input: {
      ...typeScale.body,
      minHeight: size.regularControl,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      color: colors.text,
      includeFontPadding: false,
    },
    inputFocused: {
      borderColor: colors.focus,
      borderWidth: 2,
    },
    inputError: {
      borderColor: colors.danger,
    },
    inputDisabled: {
      borderColor: colors.border,
      backgroundColor: colors.surfaceDisabled,
      color: colors.textDisabled,
    },
    supporting: {
      ...typeScale.caption,
      paddingHorizontal: space.xs,
      color: colors.textMuted,
    },
    supportingError: {
      color: colors.danger,
    },
  });
}
