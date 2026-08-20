import type { PropsWithChildren, ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';

export type SelectionControlRole = Extract<
  AccessibilityRole,
  'button' | 'checkbox' | 'radio'
>;

export const SELECTION_CONTROL_CONTRACT = {
  borderWidth: 2,
  focusOffset: 2,
  focusWidth: 2,
  minimumTouchTarget: 48,
} as const;

export function resolveSelectionAccessibilityState(
  selected: boolean,
  disabled: boolean,
  role: SelectionControlRole,
): AccessibilityState {
  return role === 'button'
    ? { disabled, selected }
    : { checked: selected, disabled };
}

type SelectionCardProps = PropsWithChildren<{
  accessibilityHint?: string;
  accessibilityLabel?: string;
  accessibilityRole?: SelectionControlRole;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  onPress: () => void;
  selected: boolean;
  semanticColor?: string;
  showCheck?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function SelectionCard({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole = 'radio',
  children,
  contentStyle,
  disabled = false,
  onPress,
  selected,
  semanticColor,
  showCheck = true,
  style,
  testID,
}: SelectionCardProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const focus = useWebFocusVisible();
  const displaysCheck = selected && showCheck;

  return (
    <Pressable
      aria-checked={
        accessibilityRole === 'radio' || accessibilityRole === 'checkbox'
          ? selected
          : undefined
      }
      aria-selected={accessibilityRole === 'button' ? selected : undefined}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={resolveSelectionAccessibilityState(
        selected,
        disabled,
        accessibilityRole,
      )}
      disabled={disabled}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        focus.focusVisible && !disabled && styles.focusVisible,
        style,
      ]}>
      {semanticColor ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.semanticRail, { backgroundColor: semanticColor }]}
        />
      ) : null}
      <View
        style={[
          styles.cardContent,
          contentStyle,
          displaysCheck && styles.cardContentWithCheck,
          semanticColor ? styles.cardContentWithRail : null,
        ]}>
        {children}
      </View>
      {displaysCheck ? (
        <SelectionCheck palette={palette} testID={testID ? `${testID}-check` : undefined} />
      ) : null}
    </Pressable>
  );
}

type SelectionPillProps = {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  accessibilityRole?: SelectionControlRole;
  disabled?: boolean;
  icon?: AppIconName | ReactNode;
  label: string;
  onPress: () => void;
  selected: boolean;
  semanticColor?: string;
  showCheck?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function SelectionPill({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole = 'radio',
  disabled = false,
  icon,
  label,
  onPress,
  selected,
  semanticColor,
  showCheck = true,
  style,
  testID,
}: SelectionPillProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const focus = useWebFocusVisible();
  const iconColor = disabled
    ? palette.disabledInk
    : semanticColor ?? (selected ? palette.ink : palette.inkMuted);

  return (
    <Pressable
      aria-checked={
        accessibilityRole === 'radio' || accessibilityRole === 'checkbox'
          ? selected
          : undefined
      }
      aria-selected={accessibilityRole === 'button' ? selected : undefined}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      accessibilityState={resolveSelectionAccessibilityState(
        selected,
        disabled,
        accessibilityRole,
      )}
      disabled={disabled}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.pill,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        focus.focusVisible && !disabled && styles.focusVisible,
        style,
      ]}>
      {semanticColor ? (
        <View style={[styles.pillSemanticLine, { backgroundColor: semanticColor }]} />
      ) : null}
      {icon ? (
        typeof icon === 'string' ? (
          <AppIcon accessible={false} color={iconColor} name={icon as AppIconName} size={18} />
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.pillIcon}>
            {icon}
          </View>
        )
      ) : null}
      <AppText
        color={disabled ? palette.disabledInk : palette.ink}
        style={styles.pillLabel}
        variant="label">
        {label}
      </AppText>
      {selected && showCheck ? (
        <SelectionCheck
          compact
          palette={palette}
          testID={testID ? `${testID}-check` : undefined}
        />
      ) : null}
    </Pressable>
  );
}

export function SelectionIndicator({
  selected,
  testID,
}: {
  selected: boolean;
  testID?: string;
}) {
  const { palette } = useAppTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={stylesShared.indicatorSlot}
      testID={testID}>
      {selected ? <SelectionCheck compact palette={palette} /> : null}
    </View>
  );
}

function SelectionCheck({
  compact = false,
  palette,
  testID,
}: {
  compact?: boolean;
  palette: AppPalette;
  testID?: string;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        stylesShared.check,
        compact ? stylesShared.checkCompact : stylesShared.checkCard,
        { backgroundColor: palette.white, borderColor: palette.selectionBorder },
      ]}
      testID={testID}>
      <AppIcon
        accessible={false}
        color={palette.canvas}
        name="checkmark"
        size={compact ? 12 : 14}
        strokeWidth={2.6}
      />
    </View>
  );
}

const stylesShared = StyleSheet.create({
  check: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radii.pill,
  },
  checkCard: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 24,
    height: 24,
  },
  checkCompact: { width: 20, height: 20 },
  indicatorSlot: {
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: {
      minHeight: 54,
      position: 'relative',
      borderWidth: SELECTION_CONTROL_CONTRACT.borderWidth,
      borderColor: palette.controlLine,
      borderRadius: radii.medium,
      backgroundColor: palette.surface,
    },
    cardContent: {
      flexGrow: 1,
      minWidth: 0,
      padding: spacing.large,
    },
    cardContentWithCheck: { paddingRight: 52 },
    cardContentWithRail: { paddingLeft: spacing.xlarge },
    pill: {
      minHeight: SELECTION_CONTROL_CONTRACT.minimumTouchTarget,
      minWidth: SELECTION_CONTROL_CONTRACT.minimumTouchTarget,
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
      overflow: 'hidden',
      borderWidth: SELECTION_CONTROL_CONTRACT.borderWidth,
      borderColor: palette.controlLine,
      borderRadius: radii.pill,
      backgroundColor: palette.surface,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
    },
    pillIcon: {
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillLabel: {
      minWidth: 0,
      flexShrink: 1,
      textAlign: 'center',
    },
    pillSemanticLine: {
      width: 3,
      height: 20,
      flexShrink: 0,
      borderRadius: 2,
    },
    semanticRail: {
      position: 'absolute',
      top: 12,
      bottom: 12,
      left: 7,
      width: 3,
      borderRadius: 2,
    },
    selected: {
      borderColor: palette.selectionBorder,
      backgroundColor: palette.selectionSurface,
    },
    disabled: {
      borderColor: palette.line,
      backgroundColor: palette.disabledSurface,
    },
    pressed: { transform: [{ scale: 0.985 }] },
    focusVisible:
      Platform.OS === 'web'
        ? {
            outlineColor: palette.focus,
            outlineOffset: SELECTION_CONTROL_CONTRACT.focusOffset,
            outlineStyle: 'solid',
            outlineWidth: SELECTION_CONTROL_CONTRACT.focusWidth,
          }
        : {},
  });
}
