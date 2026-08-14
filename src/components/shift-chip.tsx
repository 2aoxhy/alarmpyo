import { Pressable, type TextStyle, View, type ViewStyle } from 'react-native';

import { AnimatedShiftIcon, getShiftIconKind } from '@/components/animated-shift-icon';
import { AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ShiftType } from '@/models/app-data';
import { getShiftAppearance } from '@/utils/shift-appearance';

export function ShiftChip({
  shift,
  selected = false,
  compact = false,
  onPress,
}: {
  shift: ShiftType;
  selected?: boolean;
  compact?: boolean;
  onPress?: () => void;
}) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const appearance = getShiftAppearance(shift, palette, isDark);
  const content = (
    <View
      style={[
        styles.chip,
        compact && styles.compact,
        {
          backgroundColor: appearance.softColor,
          borderColor: selected ? appearance.accentColor : palette.transparent,
        },
      ]}>
      <AnimatedShiftIcon
        animated={selected}
        color={appearance.accentColor}
        kind={getShiftIconKind(shift.id, shift.isOff)}
        size={compact ? 15 : 19}
      />
      <AppText variant={compact ? 'caption' : 'label'} tone="primary">
        {compact ? shift.shortName : shift.name}
      </AppText>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${shift.name} 근무`}
      hitSlop={2}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

const createStyles = (palette: AppPalette) => ({
  chip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: palette.transparent,
  },
  compact: {
    minHeight: 28,
    gap: 5,
    paddingHorizontal: 8,
    borderWidth: 1.5,
  },
  pressed: {
    opacity: 0.7,
  },
} satisfies Record<string, ViewStyle | TextStyle>);
