import { useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';

import { interaction, shape, size, space, typeScale } from './tokens';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type SegmentedControlOption<Value extends string> = {
  value: Value;
  label: string;
  accessibilityLabel?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<Value extends string> =
  DesignSystemThemeProps & {
    label: string;
    options: readonly SegmentedControlOption<Value>[];
    value: Value;
    onChange: (value: Value) => void;
    disabled?: boolean;
    layout?: 'auto' | 'row' | 'stacked';
    style?: StyleProp<ViewStyle>;
    testID?: string;
  };

export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  layout = 'auto',
  style,
  theme,
  testID,
}: SegmentedControlProps<Value>) {
  const { colors } = useDesignSystemTheme(theme);
  const { fontScale, width } = useWindowDimensions();
  const stacked =
    layout === 'stacked' ||
    (layout === 'auto' && (fontScale >= 1.65 || (width < 340 && options.length > 2)));
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="radiogroup"
      style={[styles.container, stacked && styles.containerStacked, style]}
      testID={testID}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const optionDisabled = disabled || Boolean(option.disabled);
        return (
          <SegmentedOption
            key={option.value}
            label={option.accessibilityLabel ?? option.label}
            optionLabel={option.label}
            optionDisabled={optionDisabled}
            first={index === 0}
            onPress={() => onChange(option.value)}
            selected={selected}
            stacked={stacked}
            styles={styles}
          />
        );
      })}
    </View>
  );
}

function SegmentedOption({
  label,
  optionLabel,
  optionDisabled,
  first,
  onPress,
  selected,
  stacked,
  styles,
}: {
  label: string;
  optionLabel: string;
  optionDisabled: boolean;
  first: boolean;
  onPress: () => void;
  selected: boolean;
  stacked: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const focus = useWebFocusVisible();
  return (
    <Pressable
      aria-checked={selected}
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: optionDisabled }}
      disabled={optionDisabled}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        stacked && styles.optionStacked,
        !first && (stacked ? styles.optionDividerStacked : styles.optionDivider),
        selected && styles.optionSelected,
        selected && stacked && styles.optionSelectedStacked,
        pressed && !optionDisabled && styles.optionPressed,
        focus.focusVisible && !optionDisabled && styles.focusVisible,
        optionDisabled && styles.optionDisabled,
      ]}>
      <Text
        numberOfLines={stacked ? undefined : 2}
        style={[
          styles.label,
          selected && styles.labelSelected,
          optionDisabled && styles.labelDisabled,
        ]}>
        {optionLabel}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    container: {
      width: '100%',
      minHeight: size.regularControl,
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: shape.section,
      backgroundColor: colors.surface,
    },
    containerStacked: {
      flexDirection: 'column',
    },
    option: {
      minWidth: size.minimumTouchTarget,
      minHeight: size.minimumTouchTarget,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: shape.section,
    },
    optionStacked: {
      width: '100%',
    },
    optionSelected: {
      borderBottomWidth: 3,
      borderBottomColor: colors.focus,
      backgroundColor: colors.surfaceSelected,
    },
    optionSelectedStacked: {
      borderBottomWidth: 0,
      borderLeftWidth: 3,
      borderLeftColor: colors.focus,
    },
    optionDivider: {
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
    },
    optionDividerStacked: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      borderLeftWidth: 0,
    },
    optionPressed: {
      opacity: interaction.pressedOpacity,
    },
    optionDisabled: {
      backgroundColor: colors.surfaceDisabled,
    },
    focusVisible:
      Platform.OS === 'web'
        ? {
            outlineColor: colors.focus,
            outlineOffset: 2,
            outlineStyle: 'solid',
            outlineWidth: 2,
          }
        : {},
    label: {
      ...typeScale.label,
      color: colors.textMuted,
      textAlign: 'center',
    },
    labelSelected: {
      color: colors.accentStrong,
    },
    labelDisabled: {
      color: colors.textDisabled,
    },
  });
}
