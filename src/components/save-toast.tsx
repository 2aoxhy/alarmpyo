import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, type TextStyle, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { AppText } from '@/components/ui-kit';
import {
  colorWithAlpha,
  radii,
  shadow,
  spacing,
  type AppPalette,
} from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useAppStoreStatus } from '@/store/app-store';

const ENTER_DURATION = 250;
const VISIBLE_DURATION = 1900;
const EXIT_DURATION = 190;

export function SaveToast() {
  const { saveStatus, saveSuccessRevision } = useAppStoreStatus();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const reduceMotion = useReduceMotion();
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    if (saveStatus !== 'error') return;

    progress.stopAnimation();
    const timer = setTimeout(() => {
      visibleRef.current = false;
      setVisible(false);
      progress.setValue(0);
    }, 0);
    return () => clearTimeout(timer);
  }, [progress, saveStatus]);

  useEffect(() => {
    if (saveSuccessRevision === 0) return;

    let animation: Animated.CompositeAnimation | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const showTimer = setTimeout(() => {
      const alreadyVisible = visibleRef.current;
      visibleRef.current = true;
      setVisible(true);
      progress.stopAnimation();
      if (!alreadyVisible) progress.setValue(0);
      if (reduceMotion) {
        progress.setValue(1);
        hideTimer = setTimeout(() => {
          visibleRef.current = false;
          setVisible(false);
          progress.setValue(0);
        }, VISIBLE_DURATION);
        return;
      }
      animation = Animated.sequence([
        Animated.timing(progress, {
          duration: alreadyVisible ? 140 : ENTER_DURATION,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          toValue: 1,
          useNativeDriver,
        }),
        Animated.delay(VISIBLE_DURATION),
        Animated.timing(progress, {
          duration: EXIT_DURATION,
          easing: Easing.bezier(0.4, 0, 1, 1),
          toValue: 0,
          useNativeDriver,
        }),
      ]);
      animation.start(({ finished }) => {
        if (finished) {
          visibleRef.current = false;
          setVisible(false);
        }
      });
    }, 0);
    return () => {
      clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
      animation?.stop();
    };
  }, [progress, reduceMotion, saveSuccessRevision, useNativeDriver]);

  if (!visible) return null;

  return (
    <Animated.View
      key={`save-success-${saveSuccessRevision}`}
      accessibilityLiveRegion="polite"
      accessibilityLabel="저장 완료. 변경 내용을 휴대폰에 저장했습니다."
      style={[
        styles.positioner,
        {
          opacity: progress,
          top: Math.max(insets.top, spacing.small) + spacing.small,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-28, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.98, 1],
              }),
            },
          ],
        },
      ]}>
      <View style={styles.toast}>
        <View style={styles.icon}>
          <AppIcon
            color={isDark ? palette.canvas : palette.white}
            name="checkmark"
            size={19}
            strokeWidth={2.4}
          />
        </View>
        <View style={styles.copy}>
          <AppText variant="label" color={isDark ? palette.ink : palette.white}>
            저장 완료
          </AppText>
          <AppText
            variant="caption"
            color={isDark ? palette.inkMuted : palette.indigoSoft}>
            변경 내용을 휴대폰에 저장했습니다.
          </AppText>
        </View>
      </View>
    </Animated.View>
  );
}

const createStyles = (palette: AppPalette, isDark: boolean) => ({
  positioner: {
    pointerEvents: 'none',
    position: 'absolute',
    left: spacing.medium,
    right: spacing.medium,
    zIndex: 1000,
    elevation: 20,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: 520,
    minHeight: 68,
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.medium,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: isDark ? palette.controlLine : palette.indigo,
    backgroundColor: isDark ? palette.surface : palette.indigoDark,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: `0 10px 28px ${colorWithAlpha(
            palette.shadowColor,
            isDark ? 0.34 : 0.12,
          )}`,
        }
      : isDark
        ? { ...shadow, shadowColor: palette.shadowColor, shadowOpacity: 0.24 }
        : shadow),
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.mint,
  },
  copy: { flex: 1, gap: 1 },
} satisfies Record<string, ViewStyle | TextStyle>);
