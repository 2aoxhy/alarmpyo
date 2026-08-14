import { useEffect, useMemo, useRef, useState } from 'react';
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

import {
  interaction,
  radius,
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
  const announcementKey = `${tone}\u0000${title ?? ''}\u0000${message}\u0000${actionLabel ?? ''}`;
  const previousAnnouncementKeyRef = useRef(announcementKey);
  const [liveRegion, setLiveRegion] = useState<'none' | 'polite' | 'assertive'>('none');

  useEffect(() => {
    const changed = previousAnnouncementKeyRef.current !== announcementKey;
    previousAnnouncementKeyRef.current = announcementKey;
    if (!announceChanges || !changed) {
      setLiveRegion('none');
      return;
    }

    setLiveRegion(tone === 'danger' ? 'assertive' : 'polite');
    const timeout = setTimeout(() => setLiveRegion('none'), 1_000);
    return () => clearTimeout(timeout);
  }, [announceChanges, announcementKey, tone]);

  return (
    <View
      accessibilityLiveRegion={liveRegion}
      style={[
        styles.banner,
        { backgroundColor: toneColors.background },
        stackAction && styles.bannerStacked,
        style,
      ]}
      testID={testID}>
      <View style={styles.contentRow}>
        <View style={[styles.iconTile, { backgroundColor: toneColors.iconBackground }]}>
          <AppIcon
            accessible={false}
            color={toneColors.foreground}
            name={resolvedIcon}
            size={size.iconMedium}
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
          onPress={onAction}
          style={({ pressed }) => [
            styles.action,
            stackAction && styles.actionStacked,
            pressed && styles.actionPressed,
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
      return { background: colors.infoSoft, foreground: colors.info, iconBackground: colors.surface };
    case 'success':
      return {
        background: colors.positiveSoft,
        foreground: colors.positive,
        iconBackground: colors.surface,
      };
    case 'warning':
      return {
        background: colors.warningSoft,
        foreground: colors.warning,
        iconBackground: colors.surface,
      };
    case 'danger':
      return {
        background: colors.dangerSoft,
        foreground: colors.danger,
        iconBackground: colors.surface,
      };
    default:
      return {
        background: colors.surfaceMuted,
        foreground: colors.textMuted,
        iconBackground: colors.surface,
      };
  }
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    banner: {
      width: '100%',
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      padding: space.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
    },
    bannerStacked: {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
    contentRow: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.md,
    },
    iconTile: {
      width: size.minimumTouchTarget,
      height: size.minimumTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
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
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    actionStacked: {
      width: '100%',
    },
    actionPressed: {
      opacity: interaction.pressedOpacity,
    },
    actionLabel: {
      ...typeScale.label,
      textAlign: 'center',
    },
  });
}
