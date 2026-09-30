import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui-kit';
import { space } from '@/design-system';

import {
  getQuickTimerCountdownPresentation,
  type QuickTimerDisplayClock,
} from './quick-timer-display-model';
import type { QuickTimerCountdownAnchor } from './quick-timer-model';

type QuickTimerCountdownProps = {
  active: boolean;
  anchor: QuickTimerCountdownAnchor;
  countdownFontSize: number;
  label: string;
  onExpired: (observationKey: string) => void;
  observationKey: string;
  observedClock: QuickTimerDisplayClock;
  paused?: boolean;
  screenActive: boolean;
};

function readClock() {
  return {
    monotonic: performance.now(),
    wall: Date.now(),
  };
}

function QuickTimerCountdownView({
  active,
  anchor,
  countdownFontSize,
  label,
  onExpired,
  observationKey,
  observedClock,
  paused = false,
  screenActive,
}: QuickTimerCountdownProps) {
  const [clock, setClock] = useState(readClock);
  const expiredObservationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !screenActive) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const current = readClock();
      setClock(current);
      const nextSecond = 1_000 - (current.monotonic % 1_000) + 20;
      timeout = setTimeout(tick, nextSecond);
    };
    tick();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [active, observationKey, screenActive]);

  const presentation = getQuickTimerCountdownPresentation({
    anchor,
    clock,
    observedClock,
    label,
    paused,
  });
  const { remainingMillis } = presentation;

  useEffect(() => {
    if (
      !active ||
      !screenActive ||
      remainingMillis > 0 ||
      expiredObservationRef.current === observationKey
    ) {
      return;
    }
    expiredObservationRef.current = observationKey;
    onExpired(observationKey);
  }, [active, observationKey, onExpired, remainingMillis, screenActive]);

  return (
    <View
      accessible
      collapsable={false}
      accessibilityLabel={presentation.accessibilityLabel}
      style={styles.root}
      testID="quick-timer-countdown">
      <AppText tone="secondary" style={styles.timerLabel} variant="label">
        {label}
      </AppText>
      <AppText
        maxFontSizeMultiplier={2}
        numberOfLines={1}
        style={[
          styles.countdown,
          {
            fontSize: countdownFontSize,
            lineHeight: Math.ceil(countdownFontSize * 1.22),
          },
        ]}
        variant="display">
        {presentation.countdown}
      </AppText>
      <AppText tone="secondary" style={styles.centerText} variant="body">
        {presentation.detail}
      </AppText>
    </View>
  );
}

export const QuickTimerCountdown = memo(QuickTimerCountdownView);

const styles = StyleSheet.create({
  root: {
    alignItems: 'stretch',
    gap: space.sm,
  },
  centerText: {
    textAlign: 'center',
  },
  timerLabel: {
    textAlign: 'center',
  },
  countdown: {
    marginVertical: space.xs,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
