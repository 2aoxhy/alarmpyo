import { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
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

export type ToggleRowProps = DesignSystemThemeProps & {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon?: AppIconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  icon,
  disabled = false,
  style,
  theme,
  testID,
}: ToggleRowProps) {
  const { colors } = useDesignSystemTheme(theme);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accessibilityLabel = subtitle ? `${title}. ${subtitle}` : title;
  const { fontScale, width } = useWindowDimensions();
  const reflow = shouldReflowControl(width, fontScale);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.row,
        reflow && styles.rowReflow,
        style,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      testID={testID}>
      {icon ? (
        <View style={styles.iconTile}>
          <AppIcon accessible={false} color={colors.accentStrong} name={icon} size={size.iconMedium} />
        </View>
      ) : null}
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.trailing}>
        <Switch
          disabled={disabled}
          onValueChange={onValueChange}
          thumbColor={value ? colors.onPositive : colors.surface}
          trackColor={{ false: colors.borderStrong, true: colors.positive }}
          value={value}
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
      opacity: interaction.disabledOpacity,
    },
    iconTile: {
      width: size.minimumTouchTarget,
      height: size.minimumTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceMuted,
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
    trailing: {
      width: size.minimumTouchTarget,
      height: size.minimumTouchTarget,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
