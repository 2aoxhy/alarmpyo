import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

export type ShiftIconKind = 'day' | 'night' | 'substitute' | 'off';

type AnimatedShiftIconProps = {
  kind: ShiftIconKind;
  color: string;
  size?: number;
  animated?: boolean;
  active?: boolean;
  accessibilityLabel?: string;
};

export function getShiftIconKind(shiftId: string, isOff = false): ShiftIconKind {
  if (isOff || shiftId === 'off') return 'off';
  if (shiftId === 'day') return 'day';
  if (shiftId === 'night') return 'night';
  return 'substitute';
}

export function getShiftIconName(kind: ShiftIconKind): AppIconName {
  switch (kind) {
    case 'day':
      return 'shift-day';
    case 'night':
      return 'shift-night';
    case 'substitute':
      return 'shift-substitute';
    case 'off':
      return 'shift-off';
  }
}

/**
 * 주간·야간·휴무 아이콘에 근무 성격에 맞는 작은 움직임을 더합니다.
 * 기기의 동작 줄이기 설정이 켜져 있으면 자동으로 정지합니다.
 */
export function AnimatedShiftIcon({
  kind,
  color,
  size = 24,
  animated = true,
  active = true,
  accessibilityLabel,
}: AnimatedShiftIconProps) {
  if (!animated || !active || kind === 'substitute') {
    return (
      <View style={[styles.icon, { height: size, width: size }]}>
        <AppIcon
          accessibilityLabel={accessibilityLabel}
          color={color}
          name={getShiftIconName(kind)}
          size={size}
        />
      </View>
    );
  }

  return (
    <MotionShiftIcon
      accessibilityLabel={accessibilityLabel}
      color={color}
      kind={kind}
      size={size}
    />
  );
}

function MotionShiftIcon({
  accessibilityLabel,
  color,
  kind,
  size,
}: Required<Pick<AnimatedShiftIconProps, 'color' | 'kind' | 'size'>> &
  Pick<AnimatedShiftIconProps, 'accessibilityLabel'>) {
  const [phase] = useState(() => new Animated.Value(0));
  const reduceMotion = useReduceMotion();
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    phase.stopAnimation();
    phase.setValue(0);

    if (reduceMotion) return;

    const animation = Animated.timing(phase, {
      duration: kind === 'night' ? 1100 : 900,
      easing: Easing.inOut(Easing.sin),
      toValue: 1,
      useNativeDriver,
    });

    animation.start();
    return () => {
      animation.stop();
      phase.stopAnimation();
    };
  }, [kind, phase, reduceMotion, useNativeDriver]);

  const animatedStyle = useMemo(() => {
    switch (kind) {
      case 'day':
        return {
          transform: [
            {
              translateY: phase.interpolate({
                inputRange: [0, 0.55, 1],
                outputRange: [1, -1, 0],
              }),
            },
            {
              scale: phase.interpolate({
                inputRange: [0, 0.55, 1],
                outputRange: [0.98, 1.04, 1],
              }),
            },
          ],
        };
      case 'night':
        return {
          transform: [
            {
              translateY: phase.interpolate({
                inputRange: [0, 0.55, 1],
                outputRange: [1, -2, 0],
              }),
            },
            {
              rotate: phase.interpolate({
                inputRange: [0, 0.55, 1],
                outputRange: ['-3deg', '3deg', '0deg'],
              }),
            },
          ],
        };
      case 'off':
        return {
          transform: [
            {
              translateY: phase.interpolate({
                inputRange: [0, 0.55, 1],
                outputRange: [0, -1, 0],
              }),
            },
            {
              scale: phase.interpolate({
                inputRange: [0, 0.55, 1],
                outputRange: [0.98, 1.03, 1],
              }),
            },
          ],
        };
      case 'substitute':
        return undefined;
    }
  }, [kind, phase]);

  return (
    <Animated.View
      style={[
        styles.icon,
        { height: size, width: size },
        !reduceMotion ? animatedStyle : undefined,
      ]}>
      <AppIcon
        accessibilityLabel={accessibilityLabel}
        color={color}
        name={getShiftIconName(kind)}
        size={size}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  icon: {
    pointerEvents: 'none',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
