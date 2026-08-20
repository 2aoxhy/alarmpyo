import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui-kit';
import { space } from '@/design-system';

import {
  formatQuickTimerCountdown,
  formatQuickTimerTarget,
  getQuickTimerRemainingLabel,
  getQuickTimerRemainingMillis,
  getQuickTimerTargetAt,
  type QuickTimerCountdownAnchor,
} from './quick-timer-model';

type QuickTimerCountdownProps = {
  active: boolean;
  anchor: QuickTimerCountdownAnchor;
  countdownFontSize: number;
  label: string;
  onExpired: (observationKey: string) => void;
  observationKey: string;
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

  const remainingMillis = paused
    ? anchor.remainingMillis
    : getQuickTimerRemainingMillis(anchor, clock.monotonic);
  const targetAt = paused
    ? 0
    : getQuickTimerTargetAt(remainingMillis, clock.wall);

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
      accessibilityLabel={
        paused
          ? `${label}. 일시정지했습니다. ${getQuickTimerRemainingLabel(remainingMillis)}`
          : `${label}. ${formatQuickTimerTarget(
              targetAt,
              clock.wall,
            )}에 울립니다. ${getQuickTimerRemainingLabel(remainingMillis)}`
      }
      style={styles.root}>
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
        {formatQuickTimerCountdown(remainingMillis)}
      </AppText>
      <AppText tone="secondary" style={styles.centerText} variant="body">
        {paused
          ? '재개하면 남은 시간부터 다시 시작합니다.'
          : `${formatQuickTimerTarget(targetAt, clock.wall)}에 울립니다.`}
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
