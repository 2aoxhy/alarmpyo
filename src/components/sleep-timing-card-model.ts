import type {
  SleepTimingGuidance,
  SleepTimingWindow,
} from '@/services/sleep-timing-planner';

export type CollapsedSleepAction =
  | { kind: 'continue' }
  | { at: number; kind: 'prepare-nap' }
  | { at: number; kind: 'sleep-by' };

export type CollapsedSleepSummaryModel = {
  action: CollapsedSleepAction;
  nearestWindow: SleepTimingWindow;
};

function resolveNearestSleepWindow(
  guidance: SleepTimingGuidance,
  nowTimestamp: number,
): SleepTimingWindow {
  const windows = [guidance.primary, ...guidance.additional].sort(
    (left, right) => left.startAt - right.startAt,
  );
  const activeWindow = windows.find(
    (window) => window.startAt <= nowTimestamp && nowTimestamp < window.endAt,
  );
  if (activeWindow) return activeWindow;

  return (
    windows.find((window) => window.endAt > nowTimestamp) ??
    guidance.primary
  );
}

/** 접힌 카드에는 지금 필요한 행동과 가장 가까운 수면 한 건만 남겨요. */
export function buildCollapsedSleepSummaryModel(
  guidance: SleepTimingGuidance,
  nowTimestamp: number,
): CollapsedSleepSummaryModel {
  const nearestWindow = resolveNearestSleepWindow(guidance, nowTimestamp);

  if (
    nearestWindow.startAt <= nowTimestamp &&
    nowTimestamp < nearestWindow.endAt
  ) {
    return { action: { kind: 'continue' }, nearestWindow };
  }

  if (guidance.transition && nowTimestamp < guidance.transition.endAt) {
    return {
      action: { at: guidance.transition.endAt, kind: 'prepare-nap' },
      nearestWindow,
    };
  }

  if (nearestWindow.kind === 'pre-night-nap') {
    return {
      action: {
        at: Math.max(nowTimestamp, nearestWindow.bedtimeRangeStartAt),
        kind: 'prepare-nap',
      },
      nearestWindow,
    };
  }

  return {
    action: {
      at: nearestWindow.bedtimeRangeEndAt,
      kind: 'sleep-by',
    },
    nearestWindow,
  };
}
