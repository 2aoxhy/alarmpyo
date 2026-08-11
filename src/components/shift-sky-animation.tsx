import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Circle, G, Line, Path, Svg } from 'react-native-svg';

import { useReduceMotion } from '@/hooks/use-reduce-motion';

export type ShiftSkyPhase =
  | 'dawn'
  | 'sunrise'
  | 'day'
  | 'moonrise'
  | 'sunset'
  | 'night';

export type ShiftSkyAnimationProps = {
  /** `useNow()`의 반환값을 전달하면 시간대가 자동으로 바뀝니다. */
  now?: Date;
  /** 미리보기와 테스트에서 사용할 시간입니다. `now`보다 우선합니다. */
  hour?: number;
  /** 화면과 앱이 모두 활성 상태일 때만 전환을 재생합니다. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
};

type SceneRange = {
  sunOpacity: [number, number];
  sunY: [number, number];
  moonOpacity: [number, number];
  moonY: [number, number];
  starsOpacity: [number, number];
  cloudsOpacity: [number, number];
};

const SCENES: Record<ShiftSkyPhase, SceneRange> = {
  dawn: {
    sunOpacity: [0.12, 0.38],
    sunY: [24, 11],
    moonOpacity: [0.62, 0.4],
    moonY: [-2, 7],
    starsOpacity: [0.12, 0.03],
    cloudsOpacity: [0.05, 0.12],
  },
  sunrise: {
    sunOpacity: [0.3, 0.94],
    sunY: [17, -3],
    moonOpacity: [0.76, 0.08],
    moonY: [-5, 22],
    starsOpacity: [0.11, 0],
    cloudsOpacity: [0.08, 0.18],
  },
  day: {
    sunOpacity: [0.82, 1],
    sunY: [1, -1],
    moonOpacity: [0, 0],
    moonY: [20, 20],
    starsOpacity: [0, 0],
    cloudsOpacity: [0.13, 0.2],
  },
  moonrise: {
    sunOpacity: [0.9, 0.72],
    sunY: [-1, 3],
    moonOpacity: [0.08, 0.34],
    moonY: [24, 12],
    starsOpacity: [0.02, 0.14],
    cloudsOpacity: [0.16, 0.1],
  },
  sunset: {
    sunOpacity: [0.9, 0.1],
    sunY: [-3, 24],
    moonOpacity: [0.24, 0.92],
    moonY: [17, -4],
    starsOpacity: [0.06, 0.3],
    cloudsOpacity: [0.16, 0.06],
  },
  night: {
    sunOpacity: [0, 0],
    sunY: [24, 24],
    moonOpacity: [0.78, 1],
    moonY: [1, -2],
    starsOpacity: [0.2, 0.38],
    cloudsOpacity: [0.02, 0.06],
  },
};

function normalizeHour(hour: number) {
  if (!Number.isFinite(hour)) return 0;
  return ((Math.floor(hour) % 24) + 24) % 24;
}

export function getShiftSkyPhase(hour: number): ShiftSkyPhase {
  const normalized = normalizeHour(hour);
  if (normalized === 5) return 'dawn';
  if (normalized === 6) return 'sunrise';
  if (normalized >= 7 && normalized <= 15) return 'day';
  if (normalized === 16) return 'moonrise';
  if (normalized === 17) return 'sunset';
  return 'night';
}

const SKY_GRADIENTS: Record<ShiftSkyPhase, readonly [string, string]> = {
  dawn: ['#263A59', '#765269'],
  sunrise: ['#114E68', '#A9505A'],
  day: ['#07596A', '#087568'],
  moonrise: ['#16465F', '#554B70'],
  sunset: ['#24364F', '#7B4059'],
  night: ['#0A1A31', '#1A3158'],
};

export function getShiftSkyGradient(hour: number) {
  return SKY_GRADIENTS[getShiftSkyPhase(hour)];
}

export function getShiftSkyMotionProgress(now: Date, hour?: number) {
  const currentHour = normalizeHour(hour ?? now.getHours());
  const phase = getShiftSkyPhase(currentHour);
  if (phase === 'day' || phase === 'night') return 0.55;

  // A fixed hour is used by previews, so show a balanced representative frame.
  if (hour !== undefined) return 0.5;

  const minuteProgress = (now.getMinutes() + now.getSeconds() / 60) / 60;
  return Math.min(1, Math.max(0, minuteProgress));
}

/**
 * 홈 근무 카드 뒤에 표시하는 시간대 장식입니다.
 * 실제 근무 종류 아이콘과 관계없이 현재 시각만으로 해와 달의 장면을 정합니다.
 */
export function ShiftSkyAnimation({ active = true, now, hour, style }: ShiftSkyAnimationProps) {
  const currentTime = now ?? new Date();
  const currentHour = normalizeHour(hour ?? currentTime.getHours());
  const phase = getShiftSkyPhase(currentHour);
  const transitionPhase = phase !== 'day' && phase !== 'night';
  const targetProgress = getShiftSkyMotionProgress(currentTime, hour);
  const scene = SCENES[phase];
  const [motion] = useState(() => new Animated.Value(targetProgress));
  const reduceMotion = useReduceMotion();
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    motion.stopAnimation();
    if (!active || reduceMotion) {
      motion.setValue(targetProgress);
      return;
    }

    const animation = Animated.timing(motion, {
      duration: 360,
      easing: Easing.inOut(Easing.quad),
      toValue: targetProgress,
      useNativeDriver,
    });

    animation.start();
    return () => {
      animation.stop();
      motion.stopAnimation();
    };
  }, [active, motion, reduceMotion, targetProgress, useNativeDriver]);

  const animatedStyles = useMemo(() => {
    const sunOpacity = motion.interpolate({
      inputRange: [0, 1],
      outputRange: scene.sunOpacity,
    });
    const moonOpacity = motion.interpolate({
      inputRange: [0, 1],
      outputRange: scene.moonOpacity,
    });

    return {
      clouds: {
        opacity: motion.interpolate({
          inputRange: [0, 1],
          outputRange: scene.cloudsOpacity,
        }),
        transform: [
          {
            translateX: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [-5, 5],
            }),
          },
        ],
      },
      moon: {
        opacity: moonOpacity,
        transform: [
          {
            translateY: motion.interpolate({
              inputRange: [0, 1],
              outputRange: scene.moonY,
            }),
          },
          {
            rotate: motion.interpolate({
              inputRange: [0, 1],
              outputRange: ['-4deg', '3deg'],
            }),
          },
        ],
      },
      stars: {
        opacity: motion.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [scene.starsOpacity[0], scene.starsOpacity[1], scene.starsOpacity[0]],
        }),
      },
      sun: {
        opacity: sunOpacity,
        transform: [
          {
            translateY: motion.interpolate({
              inputRange: [0, 1],
              outputRange: scene.sunY,
            }),
          },
          {
            scale: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [0.94, 1.03],
            }),
          },
        ],
      },
      sunSpin: {
        transform: [
          {
            rotate: motion.interpolate({
              inputRange: [0, 1],
              outputRange: phase === 'day' ? ['0deg', '360deg'] : ['-4deg', '4deg'],
            }),
          },
        ],
      },
    };
  }, [motion, phase, scene]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.container, style]}>
      <Animated.View style={[styles.stars, animatedStyles.stars]}>
        <StarsArtwork />
      </Animated.View>

      {phase !== 'night' ? (
        <Animated.View style={[styles.sun, animatedStyles.sun]}>
          <Animated.View style={[styles.artwork, animatedStyles.sunSpin]}>
            <SunArtwork />
          </Animated.View>
        </Animated.View>
      ) : null}

      {phase !== 'day' ? (
        <Animated.View
          style={[
            styles.moon,
            transitionPhase && styles.moonDuringTransition,
            animatedStyles.moon,
          ]}>
          <MoonArtwork />
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.clouds, animatedStyles.clouds]}>
        <CloudArtwork />
      </Animated.View>

      <Animated.View style={styles.horizon}>
        <HorizonArtwork />
      </Animated.View>
    </Animated.View>
  );
}

export function SunArtwork() {
  return (
    <Svg height="100%" viewBox="0 0 96 96" width="100%">
      <G stroke="#FFE898" strokeLinecap="round" strokeWidth="2.4">
        <Line x1="48" x2="48" y1="5" y2="17" />
        <Line x1="48" x2="48" y1="79" y2="91" />
        <Line x1="5" x2="17" y1="48" y2="48" />
        <Line x1="79" x2="91" y1="48" y2="48" />
        <Line x1="17.6" x2="26" y1="17.6" y2="26" />
        <Line x1="70" x2="78.4" y1="70" y2="78.4" />
        <Line x1="78.4" x2="70" y1="17.6" y2="26" />
        <Line x1="26" x2="17.6" y1="70" y2="78.4" />
      </G>
      <Circle cx="48" cy="48" fill="#FFE37A" fillOpacity="0.18" r="27" />
      <Circle cx="48" cy="48" fill="#FFE37A" fillOpacity="0.32" r="21" />
      <Circle cx="48" cy="48" fill="#FFF0A8" r="15" />
    </Svg>
  );
}

export function MoonArtwork() {
  return (
    <Svg height="100%" viewBox="0 0 96 96" width="100%">
      <Circle cx="47" cy="48" fill="#DDEBFF" fillOpacity="0.08" r="36" />
      <Path
        d="M55 11c-7.2 4.7-11.7 12.8-11.7 21.6 0 14.8 12 26.8 26.8 26.8 4.2 0 8.2-1 11.7-2.7A35.5 35.5 0 1 1 55 11Z"
        fill="#E9F2FF"
      />
      <Circle cx="52" cy="24" fill="#BBD1ED" fillOpacity="0.55" r="3.2" />
      <Circle cx="35" cy="57" fill="#BBD1ED" fillOpacity="0.42" r="2.4" />
    </Svg>
  );
}

function StarsArtwork() {
  return (
    <Svg height="100%" viewBox="0 0 360 180" width="100%">
      <G fill="#EAF4FF">
        <Circle cx="34" cy="28" r="1.4" />
        <Circle cx="78" cy="62" r="1" />
        <Circle cx="116" cy="22" r="1.7" />
        <Circle cx="158" cy="53" r="1.2" />
        <Circle cx="205" cy="24" r="1" />
        <Circle cx="244" cy="70" r="1.5" />
        <Circle cx="326" cy="37" r="1.2" />
        <Circle cx="291" cy="98" r="0.9" />
        <Path d="m183 89 1.4 3.2 3.2 1.4-3.2 1.4-1.4 3.2-1.4-3.2-3.2-1.4 3.2-1.4 1.4-3.2Z" />
        <Path d="m309 13 1 2.3 2.3 1-2.3 1-1 2.3-1-2.3-2.3-1 2.3-1 1-2.3Z" />
      </G>
    </Svg>
  );
}

function CloudArtwork() {
  return (
    <Svg height="100%" viewBox="0 0 220 70" width="100%">
      <Path
        d="M17 49h65c8 0 14-5 14-12 0-6-5-11-12-12-2-11-12-19-24-19-10 0-19 6-22 15a16 16 0 0 0-21 15c0 5 2 9 6 13Z"
        fill="#FFFFFF"
      />
      <Path
        d="M124 59h77c6 0 11-4 11-10 0-5-4-9-9-10-2-9-10-15-20-15-8 0-15 5-18 12a13 13 0 0 0-18 12c0 5 3 9 7 11Z"
        fill="#DCEBFA"
        fillOpacity="0.72"
      />
    </Svg>
  );
}

function HorizonArtwork() {
  return (
    <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 78" width="100%">
      <Path
        d="M0 54c48-20 90-3 133-11 48-9 88-25 137-13 34 8 61 10 90-1v49H0V54Z"
        fill="#74D5C4"
        fillOpacity="0.08"
      />
      <Path
        d="M0 65c57-14 98-2 147-8 56-7 103-16 150-4 25 7 45 8 63 3v22H0V65Z"
        fill="#FFFFFF"
        fillOpacity="0.05"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  artwork: {
    height: '100%',
    width: '100%',
  },
  stars: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sun: {
    height: 74,
    position: 'absolute',
    right: 14,
    top: 12,
    width: 74,
  },
  moon: {
    height: 66,
    position: 'absolute',
    right: 18,
    top: 16,
    width: 66,
  },
  moonDuringTransition: {
    right: 84,
  },
  clouds: {
    height: 62,
    position: 'absolute',
    right: -36,
    top: 118,
    width: 194,
  },
  horizon: {
    bottom: 0,
    height: 78,
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
