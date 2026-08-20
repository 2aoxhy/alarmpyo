import {
  forwardRef,
  type PropsWithChildren,
  type ReactNode,
  type Ref,
} from 'react';
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

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { type AppPalette } from '@/constants/app-theme';
import {
  createSemanticColors,
  interaction,
  radius,
  resolveTextTone,
  size as controlSize,
  space,
  type TextTone,
  typeScale,
} from '@/design-system/tokens';
import { Button as DesignSystemButton } from '@/design-system/button';
import { Heading } from '@/design-system/heading';
import { Surface as DesignSystemSurface } from '@/design-system/surface';
import { shouldReflowControl } from '@/design-system/responsive';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';
import { resolveFloatingTabBarLayout } from '@/utils/floating-tab-bar';

const DEFAULT_SCREEN_SAFE_AREA_EDGES: readonly Edge[] = [
  'top',
  'left',
  'right',
];

type AppTextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

type AppTextProps = PropsWithChildren<{
  variant?: AppTextVariant;
  tone?: TextTone;
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
  tone = 'primary',
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
      style={[
        styles.textBase,
        textVariants[variant],
        { color: color ?? resolveTextTone(palette, tone) },
        style,
      ]}>
      {children}
    </Text>
  );
});

export function Screen({
  children,
  scroll = true,
  contentStyle,
  background,
  footer,
  footerBottomOffset = 0,
  maxContentWidth = 600,
  safeAreaEdges = DEFAULT_SCREEN_SAFE_AREA_EDGES,
  showsVerticalScrollIndicator = Platform.OS !== 'web',
}: PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  background?: ReactNode;
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
        contentStyle,
        footer
          ? styles.screenContentWithFooter
          : { paddingBottom: floatingTabBarContentOffset },
      ]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={styles.safeArea} edges={safeAreaEdges}>
      {background ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}>
          {background}
        </View>
      ) : null}
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

export const Card = DesignSystemSurface;

export const AppButton = DesignSystemButton;

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
          <Heading level={3} style={styles.sectionHeaderTitleFull}>
            {title}
          </Heading>
        </View>
      );
    }

    if (stackCenteredAction) {
      return (
        <View style={[styles.sectionHeader, styles.sectionHeaderStacked]}>
          <Heading level={3} style={styles.sectionHeaderTitleFull}>
            {title}
          </Heading>
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
        <Heading level={3} style={styles.sectionHeaderTitleCentered}>
          {title}
        </Heading>
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
      <Heading level={3}>
        {title}
      </Heading>
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
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.iconTile, { backgroundColor: backgroundColor ?? palette.indigoSoft }]}>
      <AppIcon
        accessible={false}
        color={color ?? (isDark ? palette.indigoDark : palette.indigo)}
        name={icon}
        size={21}
      />
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
  elementRef,
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
  elementRef?: Ref<React.ElementRef<typeof Pressable>>;
}) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const rowFocus = useWebFocusVisible();
  const { fontScale, width } = useWindowDimensions();
  const reflow = shouldReflowControl(width, fontScale);
  const foreground = disabled || loading
    ? palette.disabledInk
    : destructive
      ? palette.danger
      : palette.ink;
  const iconForeground = destructive
    ? disabled || loading
      ? palette.disabledInk
      : palette.danger
    : disabled || loading
      ? palette.disabledInk
      : isDark
        ? palette.indigoDark
        : palette.indigo;
  return (
    <Pressable
      ref={elementRef}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { busy: loading, disabled: disabled || loading, expanded } : undefined}
      disabled={!onPress || disabled || loading}
      onBlur={rowFocus.onBlur}
      onFocus={rowFocus.onFocus}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        reflow && styles.listRowReflow,
        pressed && onPress && !disabled && !loading && styles.rowPressed,
        (disabled || loading) && styles.rowDisabled,
        rowFocus.focusVisible && onPress && !disabled && !loading && styles.webFocusVisible,
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
            tone="secondary"
            numberOfLines={
              allowSubtitleWrapping || reflow || fontScale >= 1.3 ? undefined : 2
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
        tone="secondary"
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
  webFocusVisible:
    Platform.OS === 'web'
      ? {
          outlineColor: createSemanticColors(palette, isDark).focus,
          outlineOffset: 2,
          outlineStyle: 'solid',
          outlineWidth: 2,
        }
      : {},
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
  rowDisabled: {
    borderRadius: radius.md,
    backgroundColor: palette.disabledSurface,
  },
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
