import { forwardRef, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import {
  type Edge,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  resolveAppButtonIcon,
  resolveAppButtonLabel,
} from '@/components/app-button-policy';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import {
  colorWithAlpha,
  shadow,
  type AppPalette,
} from '@/constants/app-theme';
import {
  interaction,
  radius,
  size as controlSize,
  space,
  typeScale,
} from '@/design-system/tokens';
import { shouldReflowControl } from '@/design-system/responsive';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { resolveFloatingTabBarLayout } from '@/utils/floating-tab-bar';

const DEFAULT_SCREEN_SAFE_AREA_EDGES: readonly Edge[] = [
  'top',
  'left',
  'right',
];

type AppTextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

type AppTextProps = PropsWithChildren<{
  variant?: AppTextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}> & Pick<
  TextProps,
  'accessibilityLabel' | 'accessibilityRole' | 'maxFontSizeMultiplier' | 'selectable'
>;

export const AppText = forwardRef<Text, AppTextProps>(function AppText({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
  maxFontSizeMultiplier,
  selectable,
  accessibilityLabel,
  accessibilityRole,
}, ref) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Text
      ref={ref}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[styles.textBase, textVariants[variant], { color: color ?? palette.ink }, style]}>
      {children}
    </Text>
  );
});

export function Screen({
  children,
  scroll = true,
  contentStyle,
  footer,
  footerBottomOffset = 0,
  maxContentWidth = 600,
  safeAreaEdges = DEFAULT_SCREEN_SAFE_AREA_EDGES,
  showsVerticalScrollIndicator = true,
}: PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  footerBottomOffset?: number;
  maxContentWidth?: number;
  safeAreaEdges?: readonly Edge[];
  showsVerticalScrollIndicator?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const floatingTabBarContentOffset = resolveFloatingTabBarLayout(
    fontScale,
    insets.bottom,
    Platform.OS === 'web',
  ).contentOffset;
  const content = (
    <View
      style={[
        styles.screenContent,
        { maxWidth: maxContentWidth },
        footer
          ? styles.screenContentWithFooter
          : { paddingBottom: floatingTabBarContentOffset },
        contentStyle,
      ]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={styles.safeArea} edges={safeAreaEdges}>
      <View style={styles.backgroundAccent} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoider}>
        {scroll ? (
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}>
            {content}
          </ScrollView>
        ) : (
          content
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              {
                maxWidth: maxContentWidth,
                marginBottom: Math.max(footerBottomOffset, 0),
                paddingBottom: Math.max(insets.bottom, space.md),
              },
            ]}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  elevated = false,
  density = 'regular',
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  density?: 'regular' | 'compact';
}>) {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[
        styles.card,
        density === 'compact' && styles.cardCompact,
        elevated && styles.cardElevated,
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
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

export function AppButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  size = 'regular',
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const reflow = shouldReflowControl(width, fontScale);
  const visibleLabel = resolveAppButtonLabel(label);
  const visibleIcon = resolveAppButtonIcon(visibleLabel, icon);
  const blocked = disabled || loading;
  const buttonStyle = {
    primary: styles.buttonPrimary,
    secondary: styles.buttonSecondary,
    ghost: styles.buttonGhost,
    danger: styles.buttonDanger,
    destructive: styles.buttonDanger,
  }[variant];
  const activeForeground =
    variant === 'primary'
      ? palette.white
      : variant === 'danger' || variant === 'destructive'
        ? palette.danger
        : palette.indigoDark;
  const foreground = disabled ? palette.disabledInk : activeForeground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? visibleLabel}
      accessibilityState={{ disabled: blocked, busy: loading }}
      android_ripple={{ color: colorWithAlpha(foreground, 0.14) }}
      disabled={blocked}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        size === 'compact' && styles.buttonCompact,
        buttonStyle,
        style,
        pressed && !blocked && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        loading && styles.buttonLoading,
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : visibleIcon ? (
        <AppIcon accessible={false} color={foreground} name={visibleIcon} size={19} />
      ) : null}
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        numberOfLines={reflow ? undefined : 2}
        style={[styles.buttonLabel, { color: foreground }]}>
        {visibleLabel}
      </Text>
    </Pressable>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
  centered = false,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  centered?: boolean;
}) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const hasAction = Boolean(action && onAction);
  const stackCenteredAction = centered && hasAction && (width < 360 || fontScale >= 1.25);

  if (centered) {
    if (!hasAction) {
      return (
        <View style={[styles.sectionHeader, styles.sectionHeaderCenteredOnly]}>
          <AppText
            accessibilityRole="header"
            variant="heading"
            style={styles.sectionHeaderTitleFull}>
            {title}
          </AppText>
        </View>
      );
    }

    if (stackCenteredAction) {
      return (
        <View style={[styles.sectionHeader, styles.sectionHeaderStacked]}>
          <AppText
            accessibilityRole="header"
            variant="heading"
            style={styles.sectionHeaderTitleFull}>
            {title}
          </AppText>
          <Pressable
            accessibilityLabel={action!}
            accessibilityRole="button"
            hitSlop={12}
            onPress={onAction!}
            style={({ pressed }) => [
              styles.sectionHeaderActionStacked,
              pressed && styles.sectionHeaderActionPressed,
            ]}>
            <AppText variant="label" color={isDark ? palette.indigoDark : palette.indigo}>
              {action!}
            </AppText>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.sectionHeader, styles.sectionHeaderCentered]}>
        <View style={styles.sectionHeaderSide} />
        <AppText
          accessibilityRole="header"
          variant="heading"
          style={styles.sectionHeaderTitleCentered}>
          {title}
        </AppText>
        <View style={styles.sectionHeaderSide}>
          {hasAction ? (
            <Pressable
              accessibilityLabel={action!}
              accessibilityRole="button"
              hitSlop={12}
              onPress={onAction!}
              style={({ pressed }) => [
                styles.sectionHeaderAction,
                pressed && styles.sectionHeaderActionPressed,
              ]}>
              <AppText variant="label" color={isDark ? palette.indigoDark : palette.indigo}>
                {action!}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.sectionHeader}>
      <AppText accessibilityRole="header" variant="heading">
        {title}
      </AppText>
      {action && onAction ? (
        <Pressable
          accessibilityLabel={action}
          accessibilityRole="button"
          hitSlop={12}
          onPress={onAction}
          style={({ pressed }) => [
            styles.sectionHeaderAction,
            pressed && styles.sectionHeaderActionPressed,
          ]}>
          <AppText variant="label" color={isDark ? palette.indigoDark : palette.indigo}>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function IconTile({
  icon,
  color,
  backgroundColor,
}: {
  icon: AppIconName;
  color?: string;
  backgroundColor?: string;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.iconTile, { backgroundColor: backgroundColor ?? palette.indigoSoft }]}>
      <AppIcon accessible={false} color={color ?? palette.indigo} name={icon} size={21} />
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  destructive = false,
  disabled = false,
  loading = false,
  expanded,
  allowSubtitleWrapping = false,
}: {
  icon: AppIconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  expanded?: boolean;
  allowSubtitleWrapping?: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const reflow = shouldReflowControl(width, fontScale);
  const foreground = destructive ? palette.danger : palette.ink;
  const iconForeground = destructive ? palette.danger : palette.indigo;
  return (
    <Pressable
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { busy: loading, disabled: disabled || loading, expanded } : undefined}
      disabled={!onPress || disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        reflow && styles.listRowReflow,
        pressed && onPress && !disabled && !loading && styles.rowPressed,
        (disabled || loading) && styles.rowDisabled,
      ]}>
      <IconTile
        icon={icon}
        color={iconForeground}
        backgroundColor={destructive ? palette.dangerSoft : palette.surfaceSoft}
      />
      <View style={styles.listRowText}>
        <AppText variant="label" color={foreground} style={styles.listRowTitle}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText
            variant="caption"
            color={palette.inkMuted}
            numberOfLines={
              allowSubtitleWrapping || fontScale >= 1.3 ? undefined : 2
            }
            style={styles.listRowSubtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {loading || trailing || onPress ? (
        <View style={styles.listRowTrailing}>
          {loading ? (
            <ActivityIndicator color={palette.indigo} size="small" />
          ) : (
            trailing ??
            (onPress ? (
              <AppIcon
                accessible={false}
                color={palette.inkSoft}
                name="chevron-forward"
                size={18}
              />
            ) : null)
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

export function MenuGroup({
  title,
  children,
  centered = false,
  style,
}: PropsWithChildren<{
  title: string;
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
}>) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.menuGroup, style]}>
      <AppText
        accessibilityRole="header"
        style={[styles.menuGroupTitle, centered && styles.menuGroupTitleCentered]}
        variant="label">
        {title}
      </AppText>
      <Card density="compact" style={styles.menuGroupCard}>
        {children}
      </Card>
    </View>
  );
}

export function MenuDivider({ inset = true }: { inset?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.menuDivider, inset && styles.menuDividerInset]} />;
}

const createStyles = (palette: AppPalette, isDark: boolean) => ({
  safeArea: {
    flex: 1,
    backgroundColor: palette.canvas,
    overflow: 'hidden',
  },
  backgroundAccent: {
    pointerEvents: 'none',
    position: 'absolute',
    top: -104,
    right: -82,
    width: 188,
    height: 188,
    borderRadius: 94,
    backgroundColor: palette.lilacSoft,
    opacity: isDark ? 0.34 : 0.62,
  },
  keyboardAvoider: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  screenContent: {
    width: '100%',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.lg,
  },
  screenContentWithFooter: { paddingBottom: space.xl },
  footer: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  textBase: {
    includeFontPadding: false,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    padding: space.lg,
  },
  cardCompact: {
    borderRadius: radius.lg,
    paddingVertical: space.sm,
  },
  cardElevated:
    Platform.OS === 'web'
      ? {
          boxShadow: `0 10px 28px ${colorWithAlpha(
            palette.shadowColor,
            isDark ? 0.28 : 0.12,
          )}`,
        }
      : {
          ...shadow,
          shadowColor: palette.shadowColor,
          shadowOpacity: isDark ? 0.24 : 0.12,
          elevation: 4,
        },
  button: {
    minHeight: controlSize.largeControl,
    minWidth: 96,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
    overflow: 'hidden',
  },
  buttonDisabled: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.disabledSurface,
  },
  buttonLoading: {},
  buttonLabel: {
    ...typeScale.label,
    minWidth: controlSize.regularControl,
    flexShrink: 1,
    includeFontPadding: false,
    color: palette.white,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  buttonPressed: { transform: [{ scale: 0.985 }] },
  buttonCompact: {
    minHeight: controlSize.minimumTouchTarget,
    minWidth: 88,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  buttonPrimary: {
    borderWidth: 1.5,
    borderColor: palette.indigo,
    backgroundColor: palette.indigo,
  },
  buttonSecondary: {
    borderWidth: 1.5,
    borderColor: palette.indigo,
    backgroundColor: palette.indigoSoft,
  },
  buttonGhost: { backgroundColor: palette.transparent },
  buttonDanger: {
    borderWidth: 1.5,
    borderColor: palette.danger,
    backgroundColor: palette.dangerSoft,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  sectionHeaderCentered: {
    justifyContent: 'space-between',
  },
  sectionHeaderCenteredOnly: {
    justifyContent: 'center',
  },
  sectionHeaderStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space.sm,
  },
  sectionHeaderActionStacked: {
    minWidth: controlSize.minimumTouchTarget,
    minHeight: controlSize.minimumTouchTarget,
    alignSelf: 'flex-end',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderAction: {
    minWidth: controlSize.minimumTouchTarget,
    minHeight: controlSize.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderActionPressed: { opacity: interaction.pressedOpacity },
  sectionHeaderTitleCentered: { flex: 1, textAlign: 'center' },
  sectionHeaderTitleFull: { width: '100%', textAlign: 'center' },
  sectionHeaderSide: {
    width: 82,
    alignItems: 'flex-end',
  },
  iconTile: {
    width: controlSize.minimumTouchTarget,
    height: controlSize.minimumTouchTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  listRowReflow: { alignItems: 'flex-start' },
  rowPressed: { opacity: interaction.pressedOpacity },
  rowDisabled: { opacity: interaction.disabledOpacity },
  listRowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  listRowTitle: {
    fontSize: typeScale.label.fontSize,
    lineHeight: typeScale.label.lineHeight,
  },
  listRowSubtitle: {
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
  },
  listRowTrailing: {
    minWidth: controlSize.minimumTouchTarget,
    minHeight: controlSize.minimumTouchTarget,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGroup: {
    gap: space.sm,
  },
  menuGroupTitle: {
    paddingHorizontal: space.xs,
    color: palette.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  menuGroupTitleCentered: {
    textAlign: 'center',
  },
  menuGroupCard: {
    paddingHorizontal: space.lg,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.line,
  },
  menuDividerInset: {
    marginLeft: controlSize.minimumTouchTarget + space.md,
  },
} satisfies Record<string, ViewStyle | TextStyle>);

const textVariants = StyleSheet.create<Record<AppTextVariant, TextStyle>>({
  display: { ...typeScale.display },
  title: { ...typeScale.title },
  heading: { ...typeScale.heading },
  body: { ...typeScale.body },
  label: { ...typeScale.label },
  caption: { ...typeScale.caption },
});
