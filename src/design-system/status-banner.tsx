import { useEffect, useMemo, useRef, useState } from 'react';
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

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';

import {
  interaction,
  size,
  space,
  type SemanticColors,
  typeScale,
} from './tokens';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type StatusBannerTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type StatusBannerProps = DesignSystemThemeProps & {
  message: string;
  title?: string;
  tone?: StatusBannerTone;
  icon?: AppIconName;
  actionLabel?: string;
  onAction?: () => void;
  /** 처음 표시할 때는 조용히 두고, 같은 배너의 내용이 바뀔 때만 읽어요. */
  announceChanges?: boolean;
  /** 권한·오류처럼 즉시 알아야 하는 배너는 처음 표시할 때도 한 번 읽어요. */
  announceOnMount?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function StatusBanner({
  message,
  title,
  tone = 'neutral',
  icon,
  actionLabel,
  onAction,
  announceChanges = true,
  announceOnMount = false,
  style,
  theme,
  testID,
}: StatusBannerProps) {
  const { colors } = useDesignSystemTheme(theme);
  const { fontScale, width } = useWindowDimensions();
  const stackAction = fontScale >= 1.35 || width < 360;
  const toneColors = resolveToneColors(colors, tone);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resolvedIcon = icon ?? resolveToneIcon(tone);
  const actionAvailable = Boolean(actionLabel && onAction);
  const actionFocus = useWebFocusVisible();
  const announcementKey = `${tone}\u0000${title ?? ''}\u0000${message}\u0000${actionLabel ?? ''}`;
  const previousAnnouncementKeyRef = useRef<string | null>(null);
  const [liveRegion, setLiveRegion] = useState<'none' | 'polite' | 'assertive'>('none');

  useEffect(() => {
    const firstAppearance = previousAnnouncementKeyRef.current === null;
    const changed = !firstAppearance && previousAnnouncementKeyRef.current !== announcementKey;
    previousAnnouncementKeyRef.current = announcementKey;
    if ((!announceOnMount || !firstAppearance) && (!announceChanges || !changed)) {
      setLiveRegion('none');
      return;
    }

    setLiveRegion(tone === 'danger' ? 'assertive' : 'polite');
    const timeout = setTimeout(() => setLiveRegion('none'), 1_000);
    return () => clearTimeout(timeout);
  }, [announceChanges, announceOnMount, announcementKey, tone]);

  return (
    <View
      accessibilityLiveRegion={liveRegion}
      style={[
        styles.banner,
        {
          backgroundColor: toneColors.background,
          borderLeftColor: toneColors.foreground,
        },
        stackAction && styles.bannerStacked,
        style,
      ]}
      testID={testID}>
      <View style={styles.contentRow}>
        <View style={styles.icon}>
          <AppIcon
            accessible={false}
            color={toneColors.foreground}
            name={resolvedIcon}
            size={size.iconSmall}
          />
        </View>
        <View style={styles.textContainer}>
          {title ? <Text style={[styles.title, { color: toneColors.foreground }]}>{title}</Text> : null}
          <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
        </View>
      </View>
      {actionAvailable ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onBlur={actionFocus.onBlur}
          onFocus={actionFocus.onFocus}
          onPress={onAction}
          style={({ pressed }) => [
            styles.action,
            stackAction && styles.actionStacked,
            pressed && styles.actionPressed,
            actionFocus.focusVisible && styles.focusVisible,
          ]}>
          <Text style={[styles.actionLabel, { color: toneColors.foreground }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function resolveToneIcon(tone: StatusBannerTone): AppIconName {
  switch (tone) {
    case 'success':
      return 'checkmark-circle';
    case 'danger':
    case 'warning':
      return 'alert-circle-outline';
    case 'info':
      return 'notifications-outline';
    default:
      return 'ellipse-outline';
  }
}

function resolveToneColors(colors: SemanticColors, tone: StatusBannerTone) {
  switch (tone) {
    case 'info':
      return { background: colors.infoSoft, foreground: colors.info };
    case 'success':
      return {
        background: colors.positiveSoft,
        foreground: colors.positive,
      };
    case 'warning':
      return {
        background: colors.warningSoft,
        foreground: colors.warning,
      };
    case 'danger':
      return {
        background: colors.dangerSoft,
        foreground: colors.danger,
      };
    default:
      return {
        background: colors.surfaceMuted,
        foreground: colors.textMuted,
      };
  }
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    banner: {
      width: '100%',
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderLeftWidth: 3,
      borderColor: colors.border,
    },
    bannerStacked: {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
    contentRow: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    icon: {
      width: size.iconMedium,
      minHeight: typeScale.body.lineHeight,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textContainer: {
      minWidth: 0,
      flex: 1,
      gap: space.xxs,
    },
    title: {
      ...typeScale.label,
    },
    message: {
      ...typeScale.body,
    },
    action: {
      minWidth: size.minimumTouchTarget,
      minHeight: size.minimumTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.sm,
    },
    actionStacked: {
      width: '100%',
      alignItems: 'flex-start',
    },
    actionPressed: {
      opacity: interaction.pressedOpacity,
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
    actionLabel: {
      ...typeScale.label,
      textAlign: 'center',
    },
  });
}
