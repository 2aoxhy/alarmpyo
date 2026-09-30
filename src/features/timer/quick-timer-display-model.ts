import type { QuickTimerStatus } from './quick-timer-controller';
import {
  createQuickTimerCountdownAnchor,
  formatQuickTimerCountdown,
  formatQuickTimerTarget,
  getQuickTimerRemainingLabel,
  getQuickTimerRemainingMillis,
  getQuickTimerTargetAt,
  type QuickTimerCountdownAnchor,
} from './quick-timer-model';

export type QuickTimerDisplayClock = Readonly<{
  monotonic: number;
  wall: number;
}>;

/** Publish the native state and its display baseline in one React state update. */
export type QuickTimerDisplayObservation = Readonly<{
  status: Readonly<QuickTimerStatus>;
  anchor: Readonly<QuickTimerCountdownAnchor>;
  clock: QuickTimerDisplayClock;
  key: string;
}>;

export function getQuickTimerObservationKey(status: QuickTimerStatus): string {
  return [status.startedAt, status.fireAt, status.isRepeat, status.state].join(':');
}

export function createQuickTimerDisplayObservation(
  status: QuickTimerStatus,
  clock: QuickTimerDisplayClock,
): QuickTimerDisplayObservation {
  return Object.freeze({
    status: Object.freeze({ ...status }),
    anchor: Object.freeze(createQuickTimerCountdownAnchor(status, clock.monotonic)),
    clock: Object.freeze({ ...clock }),
    key: getQuickTimerObservationKey(status),
  });
}

/** A replacement must not combine its new duration with the previous tick's time. */
export function getQuickTimerCountdownPresentation({
  anchor,
  clock,
  observedClock,
  label,
  paused,
}: {
  anchor: QuickTimerCountdownAnchor;
  clock: QuickTimerDisplayClock;
  observedClock: QuickTimerDisplayClock;
  label: string;
  paused: boolean;
}) {
  const displayClock = clock.monotonic < observedClock.monotonic ? observedClock : clock;
  const remainingMillis = paused
    ? anchor.remainingMillis
    : getQuickTimerRemainingMillis(anchor, displayClock.monotonic);
  const remainingLabel = getQuickTimerRemainingLabel(remainingMillis);
  const targetAt = paused ? 0 : getQuickTimerTargetAt(remainingMillis, displayClock.wall);
  const targetLabel = formatQuickTimerTarget(targetAt, displayClock.wall);
  return {
    remainingMillis,
    countdown: formatQuickTimerCountdown(remainingMillis),
    detail: paused
      ? '재개하면 남은 시간부터 다시 시작합니다.'
      : `${targetLabel}에 울립니다.`,
    accessibilityLabel: paused
      ? `${label}. 일시정지했습니다. ${remainingLabel}`
      : `${label}. ${targetLabel}에 울립니다. ${remainingLabel}`,
  };
}
