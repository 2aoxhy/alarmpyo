import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
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

export function resolveLaunchBrandVisibility(fontMode: LaunchFontMode) {
  return {
    mark: true,
    wordmark: fontMode !== 'pending',
  } as const;
}

export const LAUNCH_TRANSITION_TIMING = {
  markFade: 440,
  wordmarkFade: 440,
  fullMotionHold: 440,
  fullMotionExit: 300,
  reducedMotionExit: 140,
} as const;

export const LAUNCH_BRAND_LAYOUT = {
  groupHeight: 288,
  markSize: 240,
  wordmarkTop: 196,
  wordmarkFontSize: 60,
  wordmarkLineHeight: 72,
} as const;

export type FrozenLaunchFontMode = Exclude<LaunchFontMode, 'pending'>;

export function resolveFrozenLaunchFontMode(
  frozenMode: FrozenLaunchFontMode | null,
  currentMode: LaunchFontMode,
): FrozenLaunchFontMode {
  if (frozenMode) return frozenMode;
  return currentMode === 'pending' ? 'fallback' : currentMode;
}

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
  const [markEntry] = useState(() => new Animated.Value(0));
  const [wordmarkEntry] = useState(() => new Animated.Value(0));
  const [exit] = useState(() => new Animated.Value(0));
  const reduceMotionAtLaunch = useRef(reduceMotion);
  const readyReported = useRef(false);
  const useNativeDriver = Platform.OS !== 'web';
  const brandVisibility = resolveLaunchBrandVisibility(fontMode);

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

    markEntry.stopAnimation();
    wordmarkEntry.stopAnimation();
    exit.stopAnimation();
    exit.setValue(0);

    const animation = reduceMotionAtLaunch.current
      ? (() => {
          markEntry.setValue(1);
          wordmarkEntry.setValue(1);
          return Animated.timing(exit, {
            duration: LAUNCH_TRANSITION_TIMING.reducedMotionExit,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver,
          });
        })()
      : (() => {
          markEntry.setValue(0);
          wordmarkEntry.setValue(0);
          return Animated.sequence([
            Animated.timing(markEntry, {
              duration: LAUNCH_TRANSITION_TIMING.markFade,
              easing: Easing.out(Easing.cubic),
              toValue: 1,
              useNativeDriver,
            }),
            Animated.timing(wordmarkEntry, {
              duration: LAUNCH_TRANSITION_TIMING.wordmarkFade,
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
      markEntry.stopAnimation();
      wordmarkEntry.stopAnimation();
      exit.stopAnimation();
    };
  }, [exit, markEntry, onFinished, ready, useNativeDriver, wordmarkEntry]);

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
      <View style={styles.brand}>
        {brandVisibility.mark ? (
          <Animated.View style={[styles.brandMark, { opacity: markEntry }]}>
            <Image
              accessible={false}
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={require('../../assets/images/splash-transparent.png')}
              style={styles.brandMarkImage}
            />
          </Animated.View>
        ) : null}
        {brandVisibility.wordmark ? (
          <Animated.View
            key={fontMode}
            style={[
              styles.brandCopy,
              {
                opacity: wordmarkEntry,
              },
            ]}>
            <AppText
              variant="display"
              color="#FFFFFF"
              maxFontSizeMultiplier={1}
              style={[styles.wordmark, fontMode === 'fallback' && styles.fallbackWordmark]}>
              알람표
            </AppText>
          </Animated.View>
        ) : null}
      </View>
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
    height: LAUNCH_BRAND_LAYOUT.groupHeight,
    width: '100%',
  },
  brandMark: {
    height: LAUNCH_BRAND_LAYOUT.markSize,
    position: 'absolute',
    top: 0,
    width: LAUNCH_BRAND_LAYOUT.markSize,
  },
  brandMarkImage: { width: '100%', height: '100%' },
  brandCopy: {
    alignItems: 'center',
    position: 'absolute',
    top: LAUNCH_BRAND_LAYOUT.wordmarkTop,
  },
  wordmark: {
    fontSize: LAUNCH_BRAND_LAYOUT.wordmarkFontSize,
    lineHeight: LAUNCH_BRAND_LAYOUT.wordmarkLineHeight,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  fallbackWordmark: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    fontWeight: '800',
  },
});
