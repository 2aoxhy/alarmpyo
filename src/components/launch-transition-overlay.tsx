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

// app.json의 네이티브 스플래시와 맞춰 첫 프레임의 배경 전환을 없애요.
const SPLASH_BACKGROUND = '#101214';

export const LAUNCH_TRANSITION_TIMING = {
  arrowsEntry: 760,
  handsDelay: 200,
  handsEntry: 520,
  fullMotionHold: 1_000,
  fullMotionExit: 360,
  reducedMotionExit: 140,
} as const;

export const LAUNCH_BRAND_LAYOUT = {
  markSize: 240,
} as const;

export const LAUNCH_ENTRY_TRANSFORM: {
  arrowsRotation: string[];
  arrowsScale: number[];
  handsScale: number[];
} = {
  arrowsRotation: ['-18deg', '0deg'],
  arrowsScale: [0.94, 1],
  handsScale: [0.88, 1],
};

type LaunchTransitionOverlayProps = {
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
  onFinished,
  onReady,
  ready,
  reduceMotion,
}: LaunchTransitionOverlayProps) {
  const [arrowsEntry] = useState(() => new Animated.Value(0));
  const [handsEntry] = useState(() => new Animated.Value(0));
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

    arrowsEntry.stopAnimation();
    handsEntry.stopAnimation();
    exit.stopAnimation();
    exit.setValue(0);

    const animation = reduceMotionAtLaunch.current
      ? (() => {
          arrowsEntry.setValue(1);
          handsEntry.setValue(1);
          return Animated.timing(exit, {
            duration: LAUNCH_TRANSITION_TIMING.reducedMotionExit,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver,
          });
        })()
      : (() => {
          arrowsEntry.setValue(0);
          handsEntry.setValue(0);
          return Animated.sequence([
            Animated.parallel([
              Animated.timing(arrowsEntry, {
                duration: LAUNCH_TRANSITION_TIMING.arrowsEntry,
                easing: Easing.out(Easing.cubic),
                toValue: 1,
                useNativeDriver,
              }),
              Animated.sequence([
                Animated.delay(LAUNCH_TRANSITION_TIMING.handsDelay),
                Animated.timing(handsEntry, {
                  duration: LAUNCH_TRANSITION_TIMING.handsEntry,
                  easing: Easing.out(Easing.cubic),
                  toValue: 1,
                  useNativeDriver,
                }),
              ]),
            ]),
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
      arrowsEntry.stopAnimation();
      handsEntry.stopAnimation();
      exit.stopAnimation();
    };
  }, [arrowsEntry, exit, handsEntry, onFinished, ready, useNativeDriver]);

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
        <Animated.View
          style={[
            styles.brandLayer,
            {
              opacity: arrowsEntry,
              transform: [
                {
                  rotate: arrowsEntry.interpolate({
                    inputRange: [0, 1],
                    outputRange: LAUNCH_ENTRY_TRANSFORM.arrowsRotation,
                  }),
                },
                {
                  scale: arrowsEntry.interpolate({
                    inputRange: [0, 1],
                    outputRange: LAUNCH_ENTRY_TRANSFORM.arrowsScale,
                  }),
                },
              ],
            },
          ]}>
          <Image
            accessible={false}
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../../assets/images/alarmpyo-launch-arrows.png')}
            style={styles.brandLayerImage}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.brandLayer,
            {
              opacity: handsEntry,
              transform: [
                {
                  scale: handsEntry.interpolate({
                    inputRange: [0, 1],
                    outputRange: LAUNCH_ENTRY_TRANSFORM.handsScale,
                  }),
                },
              ],
            },
          ]}>
          <Image
            accessible={false}
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../../assets/images/alarmpyo-launch-hands.png')}
            style={styles.brandLayerImage}
          />
        </Animated.View>
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
    height: LAUNCH_BRAND_LAYOUT.markSize,
    width: LAUNCH_BRAND_LAYOUT.markSize,
  },
  brandLayer: {
    height: LAUNCH_BRAND_LAYOUT.markSize,
    position: 'absolute',
    width: LAUNCH_BRAND_LAYOUT.markSize,
  },
  brandLayerImage: { width: '100%', height: '100%' },
});
