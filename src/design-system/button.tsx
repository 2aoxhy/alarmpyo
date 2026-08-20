import { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';

import {
  resolveAppButtonIcon,
  resolveAppButtonLabel,
  type AppButtonActionId,
} from '@/components/app-button-policy';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { colorWithAlpha } from '@/constants/app-theme';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';

import { shouldReflowControl } from './responsive';
import { radius, size, space, typeScale } from './tokens';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type ButtonProps = DesignSystemThemeProps & {
  label: string;
  onPress: () => void;
  actionId?: AppButtonActionId;
  icon?: AppIconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
  size?: 'regular' | 'compact';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({
  label,
  onPress,
  actionId,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  size: controlSize = 'regular',
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
  theme,
}: ButtonProps) {
  const { colors } = useDesignSystemTheme(theme);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const focus = useWebFocusVisible();
  const { fontScale, width } = useWindowDimensions();
  const reflow = shouldReflowControl(width, fontScale);
  const visibleLabel = resolveAppButtonLabel(label);
  const visibleIcon = resolveAppButtonIcon(actionId, icon);
  const blocked = disabled || loading;
  const foreground = disabled
    ? colors.textDisabled
    : variant === 'primary'
      ? colors.background
      : variant === 'danger' || variant === 'destructive'
        ? colors.danger
        : colors.accentStrong;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? visibleLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: blocked }}
      android_ripple={{ color: colorWithAlpha(foreground, 0.14) }}
      disabled={blocked}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        controlSize === 'compact' && styles.compact,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        (variant === 'danger' || variant === 'destructive') && styles.danger,
        disabled && styles.disabled,
        pressed && !blocked && styles.pressed,
        focus.focusVisible && !blocked && styles.focusVisible,
        style,
      ]}
      testID={testID}>
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : visibleIcon ? (
        <AppIcon accessible={false} color={foreground} name={visibleIcon} size={19} />
      ) : null}
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        numberOfLines={reflow ? undefined : 2}
        style={[styles.label, { color: foreground }]}>
        {visibleLabel}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    button: {
      minWidth: 96,
      minHeight: size.largeControl,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    compact: {
      minWidth: 88,
      minHeight: size.minimumTouchTarget,
      paddingHorizontal: space.md,
    },
    primary: {
      borderWidth: 1.5,
      borderColor: colors.focus,
      backgroundColor: colors.focus,
    },
    secondary: {
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceSelected,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    danger: {
      borderWidth: 1.5,
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    disabled: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDisabled,
    },
    pressed: {
      transform: [{ scale: 0.985 }],
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
      minWidth: size.regularControl,
      flexShrink: 1,
      includeFontPadding: false,
      fontSize: 16,
      lineHeight: 22,
      textAlign: 'center',
    },
  });
}
