import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppText } from '@/components/ui-kit';
import {
  colorWithAlpha,
  radii,
  spacing,
  type AppPalette,
} from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  resolveShiftHeroTheme,
  resolveShiftVisualRole,
  shouldStackHeroFooter,
} from '@/design-system';
import type { DayExceptionType, ShiftType } from '@/models/app-data';
import { formatKoreanDate } from '@/utils/date';
import { getDayExceptionLabel } from '@/utils/day-exception';

type TodayHeroProps = {
  activeException?: DayExceptionType;
  compact: boolean;
  editorDateKey: string;
  footerLabel: string;
  footerValue: string;
  heroDetail: string;
  heroTitle: string;
  largeText: boolean;
  shift: ShiftType | null;
  statusLabel: string;
};

export function TodayHero({
  activeException,
  compact,
  editorDateKey,
  footerLabel,
  footerValue,
  heroDetail,
  heroTitle,
  largeText,
  shift,
  statusLabel,
}: TodayHeroProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const visualRole = resolveShiftVisualRole(shift, Boolean(activeException));
  const heroTheme = resolveShiftHeroTheme(visualRole, shift?.color);
  const stackFooter = shouldStackHeroFooter(width, fontScale) || largeText;

  return (
    <LinearGradient
      colors={heroTheme.gradient}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[
        styles.hero,
        compact && styles.heroCompact,
        largeText && styles.heroLargeText,
      ]}>
      <View
        pointerEvents="none"
        style={[styles.heroAccent, { backgroundColor: heroTheme.accent }]}
      />

      <View style={styles.heroStatus}>
        <View style={[styles.statusDot, { backgroundColor: heroTheme.accent }]} />
        <AppText
          color={palette.white}
          numberOfLines={largeText ? undefined : 1}
          variant="caption">
          {activeException
            ? `${statusLabel} · ${getDayExceptionLabel(activeException)}`
            : statusLabel}
        </AppText>
      </View>

      <View style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
        <AppText accessibilityRole="header" color={palette.white} variant="display">
          {heroTitle}
        </AppText>
        <AppText color={colorWithAlpha(palette.white, 0.92)}>{heroDetail}</AppText>
      </View>

      <View style={styles.heroFooterPanel}>
        <View
          style={[
            styles.heroFooter,
            stackFooter && styles.heroFooterStacked,
          ]}>
          <View
            style={[
              styles.heroFooterCopy,
              stackFooter && styles.heroFooterCopyCompact,
            ]}>
            <AppText color={colorWithAlpha(palette.white, 0.78)} variant="caption">
              {footerLabel}
            </AppText>
            <AppText color={palette.white} variant="heading">
              {footerValue}
            </AppText>
          </View>
          <Pressable
            accessibilityHint="선택한 날짜의 근무와 시간을 수정합니다."
            accessibilityLabel={`${formatKoreanDate(editorDateKey)} 일정 수정하기`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() =>
              router.push({
                pathname: '/day/[date]',
                params: { date: editorDateKey },
              })
            }
            style={({ pressed }) => [
              styles.heroEdit,
              stackFooter && styles.heroEditStacked,
              pressed && styles.pressed,
            ]}>
            <AppIcon
              accessible={false}
              color={palette.white}
              name="options-outline"
              size={18}
            />
            <AppText color={palette.white} style={styles.heroEditLabel} variant="label">
              일정 수정하기
            </AppText>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const createStyles = (_palette: AppPalette) =>
  StyleSheet.create({
    hero: {
      minHeight: 208,
      justifyContent: 'space-between',
      overflow: 'hidden',
      borderRadius: radii.large,
      padding: spacing.large,
    },
    heroCompact: {
      minHeight: 200,
    },
    heroLargeText: {
      minHeight: 240,
    },
    heroAccent: {
      position: 'absolute',
      top: 28,
      bottom: 28,
      left: 0,
      width: 3,
      borderTopRightRadius: 3,
      borderBottomRightRadius: 3,
    },
    heroStatus: {
      position: 'relative',
      zIndex: 1,
      maxWidth: '100%',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingVertical: spacing.tiny,
    },
    statusDot: {
      width: 8,
      height: 8,
      flexShrink: 0,
      borderRadius: 4,
    },
    heroCopy: {
      position: 'relative',
      zIndex: 1,
      maxWidth: '88%',
      gap: spacing.tiny,
      marginVertical: spacing.medium,
    },
    heroCopyCompact: {
      maxWidth: '100%',
    },
    heroFooterPanel: {
      position: 'relative',
      zIndex: 1,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255, 255, 255, 0.28)',
      paddingTop: spacing.small,
    },
    heroFooter: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
    },
    heroFooterStacked: {
      minHeight: 0,
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    heroFooterCopy: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    heroFooterCopyCompact: { flex: 0 },
    heroEdit: {
      minWidth: 96,
      minHeight: 48,
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: radii.small,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.48)',
      backgroundColor: 'transparent',
      paddingHorizontal: 12,
    },
    heroEditStacked: {
      width: '100%',
      marginTop: spacing.small,
      paddingVertical: spacing.small,
    },
    heroEditLabel: {
      flexShrink: 1,
      textAlign: 'center',
    },
    pressed: {
      opacity: 0.72,
      transform: [{ scale: 0.96 }],
    },
  });
