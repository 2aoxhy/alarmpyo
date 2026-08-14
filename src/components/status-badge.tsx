import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui-kit';
import { radius, space } from '@/design-system/tokens';
import { useAppTheme } from '@/hooks/use-app-theme';

export type StatusBadgeSize = 'calendar' | 'regular';

type StatusBadgeProps = {
  accessibilityLabel?: string;
  backgroundColor: string;
  borderColor?: string;
  foregroundColor?: string;
  icon?: ReactNode;
  label: string;
  maxFontSizeMultiplier?: number;
  maxWidth?: number;
  size?: StatusBadgeSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A single high-contrast container for short work and calendar statuses.
 * Meaning colors belong to the background or icon; the label stays bright so
 * it remains legible on a dark screen and in grayscale.
 */
export function StatusBadge({
  accessibilityLabel,
  backgroundColor,
  borderColor,
  foregroundColor,
  icon,
  label,
  maxFontSizeMultiplier = 1.5,
  maxWidth,
  size = 'regular',
  style,
  testID,
}: StatusBadgeProps) {
  const { palette } = useAppTheme();
  const color = foregroundColor ?? palette.white;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible={Boolean(accessibilityLabel)}
      style={[
        styles.badge,
        size === 'calendar' ? styles.calendar : styles.regular,
        {
          backgroundColor,
          borderColor: borderColor ?? palette.transparent,
          maxWidth,
        },
        style,
      ]}
      testID={testID}>
      {icon}
      <AppText
        color={color}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        numberOfLines={1}
        style={size === 'calendar' ? styles.calendarText : styles.regularText}
        variant="caption">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    maxWidth: '100%',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  calendar: {
    minHeight: 22,
    gap: 2,
    paddingHorizontal: 3,
    borderRadius: radius.xs,
  },
  regular: {
    minHeight: 28,
    gap: space.xs,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  calendarText: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  regularText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
