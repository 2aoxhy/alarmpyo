import { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';

import { interaction, radius, size, space, typeScale } from './tokens';
import { shouldReflowControl } from './responsive';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type DisclosureRowProps = DesignSystemThemeProps & {
  title: string;
  subtitle?: string;
  onPress: () => void;
  icon?: AppIconName;
  expanded?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function DisclosureRow({
  title,
  subtitle,
  onPress,
  icon,
  expanded,
  disabled = false,
  style,
  theme,
  testID,
}: DisclosureRowProps) {
  const { colors } = useDesignSystemTheme(theme);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { fontScale, width } = useWindowDimensions();
  const reflow = shouldReflowControl(width, fontScale);

  return (
    <Pressable
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        reflow && styles.rowReflow,
        style,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      testID={testID}>
      {icon ? (
        <View style={[styles.iconTile, disabled && styles.iconTileDisabled]}>
          <AppIcon
            accessible={false}
            color={disabled ? colors.textDisabled : colors.accentStrong}
            name={icon}
            size={size.iconMedium}
          />
        </View>
      ) : null}
      <View style={styles.textContainer}>
        <Text style={[styles.title, disabled && styles.textDisabled]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, disabled && styles.textDisabled]}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        <AppIcon
          accessible={false}
          color={disabled ? colors.textDisabled : colors.textSoft}
          name={expanded === undefined ? 'chevron-forward' : expanded ? 'chevron-up' : 'chevron-down'}
          size={size.iconSmall}
        />
      </View>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    row: {
      width: '100%',
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    rowReflow: {
      alignItems: 'flex-start',
    },
    pressed: {
      opacity: interaction.pressedOpacity,
    },
    disabled: {
      backgroundColor: colors.surfaceDisabled,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconTile: {
      width: size.minimumTouchTarget,
      height: size.minimumTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceMuted,
    },
    iconTileDisabled: {
      backgroundColor: colors.surfaceDisabled,
    },
    textContainer: {
      flex: 1,
      minWidth: 0,
      gap: space.xxs,
    },
    title: {
      ...typeScale.label,
      color: colors.text,
      includeFontPadding: false,
    },
    subtitle: {
      ...typeScale.caption,
      color: colors.textMuted,
      includeFontPadding: false,
    },
    textDisabled: {
      color: colors.textDisabled,
    },
    trailing: {
      width: size.minimumTouchTarget,
      height: size.minimumTouchTarget,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
