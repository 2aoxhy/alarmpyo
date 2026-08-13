import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui-kit';

// app.json의 네이티브 스플래시와 맞춰 첫 프레임의 배경 전환을 없애요.
const SPLASH_BACKGROUND = '#101214';

export type LaunchFontMode = 'pending' | 'wanted' | 'fallback';

export function resolveLaunchFontMode(
  fontsLoaded: boolean,
  hasFontError: boolean,
): LaunchFontMode {
  if (fontsLoaded) return 'wanted';
  if (hasFontError) return 'fallback';
  return 'pending';
}

export function shouldMountLaunchBrand(fontMode: LaunchFontMode) {
  return fontMode !== 'pending';
}

export const LAUNCH_TRANSITION_TIMING = {
  fullMotionDuration: 440,
  fullMotionHold: 880,
  fullMotionExit: 300,
  reducedMotionExit: 140,
} as const;

type LaunchTransitionOverlayProps = {
  fontMode: LaunchFontMode;
  ready: boolean;
  reduceMotion: boolean;
  onFinished: () => void;
  onReady: () => void;
};

const overlayElevation: ViewStyle =
  Platform.OS === 'web'
    ? { boxShadow: '0 0 0 rgba(0, 0, 0, 0)' }
    : { elevation: 30 };

export function LaunchTransitionOverlay({
  fontMode,
  onFinished,
  onReady,
  ready,
  reduceMotion,
}: LaunchTransitionOverlayProps) {
  const [entry] = useState(() => new Animated.Value(0));
  const [exit] = useState(() => new Animated.Value(0));
  const reduceMotionAtLaunch = useRef(reduceMotion);
  const readyReported = useRef(false);
  const useNativeDriver = Platform.OS !== 'web';

  const handleLayout = useCallback(() => {
    if (readyReported.current) return;
    readyReported.current = true;
    onReady();
  }, [onReady]);

  useEffect(() => {
    if (!ready) reduceMotionAtLaunch.current = reduceMotion;
  }, [ready, reduceMotion]);

  useEffect(() => {
    if (!ready) return;

    entry.stopAnimation();
    exit.stopAnimation();
    exit.setValue(0);

    const animation = reduceMotionAtLaunch.current
      ? (() => {
          entry.setValue(1);
          return Animated.timing(exit, {
            duration: LAUNCH_TRANSITION_TIMING.reducedMotionExit,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver,
          });
        })()
      : (() => {
          entry.setValue(0);
          return Animated.sequence([
            Animated.timing(entry, {
              duration: LAUNCH_TRANSITION_TIMING.fullMotionDuration,
              easing: Easing.out(Easing.cubic),
              toValue: 1,
              useNativeDriver,
            }),
            Animated.delay(LAUNCH_TRANSITION_TIMING.fullMotionHold),
            Animated.timing(exit, {
              duration: LAUNCH_TRANSITION_TIMING.fullMotionExit,
              easing: Easing.inOut(Easing.quad),
              toValue: 1,
              useNativeDriver,
            }),
          ]);
        })();

    animation.start(({ finished }) => {
      if (finished) onFinished();
    });

    return () => {
      animation.stop();
      entry.stopAnimation();
      exit.stopAnimation();
    };
  }, [entry, exit, onFinished, ready, useNativeDriver]);

  return (
    <Animated.View
      accessibilityElementsHidden
      aria-hidden={true}
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={handleLayout}
      testID="launch-transition-overlay"
      style={[
        styles.overlay,
        overlayElevation,
        {
          opacity: exit.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
        },
      ]}>
      {shouldMountLaunchBrand(fontMode) ? (
        <View key={fontMode} style={styles.brand}>
          <Animated.View
            style={[
              styles.brandCopy,
              {
                opacity: entry,
                transform: [
                  {
                    scale: entry.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}>
            <AppText
              variant="display"
              color="#FFFFFF"
              style={[styles.wordmark, fontMode === 'fallback' && styles.fallbackWordmark]}>
              알람표
            </AppText>
          </Animated.View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'auto',
    zIndex: 2000,
    overflow: 'hidden',
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  brandCopy: {
    alignItems: 'center',
  },
  wordmark: {
    fontSize: 60,
    lineHeight: 72,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  fallbackWordmark: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    fontWeight: '800',
  },
});
