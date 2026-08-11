import { describe, expect, it } from 'vitest';

import { buildCollapsedSleepSummaryModel } from '../sleep-timing-card-model';
import type {
  SleepTimingGuidance,
  SleepTimingWindow,
} from '@/services/sleep-timing-planner';

function createWindow(
  id: string,
  startAt: number,
  endAt: number,
  kind: SleepTimingWindow['kind'] = 'main',
): SleepTimingWindow {
  return {
    id,
    kind,
    title: id,
    startAt,
    endAt,
    bedtimeRangeStartAt: startAt - 100,
    bedtimeRangeEndAt: startAt,
    guidance: '수면 안내',
    relatedDateKey: '2026-08-09',
    shiftTypeId: 'day',
    shiftName: '주간',
    usesFallbackAlarmLead: false,
    transitionModeKind: null,
  };
}

function createGuidance(
  primary: SleepTimingWindow,
  additional: SleepTimingWindow[] = [],
): SleepTimingGuidance {
  return {
    primary,
    additional,
    transition: null,
    transitionMode: null,
  };
}

describe('collapsed sleep timing card model', () => {
  it('현재 수면 중이면 해당 수면을 가장 가까운 일정으로 유지해요', () => {
    const primary = createWindow('현재 주수면', 1_000, 2_000);
    const upcoming = createWindow('다음 수면', 3_000, 4_000);

    expect(
      buildCollapsedSleepSummaryModel(
        createGuidance(primary, [upcoming]),
        1_500,
      ),
    ).toEqual({
      action: { kind: 'continue' },
      nearestWindow: primary,
    });
  });

  it('지난 수면 대신 가장 가까운 다음 보충 수면 한 건을 보여 줘요', () => {
    const past = createWindow('지난 수면', 1_000, 2_000);
    const nap = createWindow('보충 수면', 3_000, 4_000, 'pre-night-nap');

    const result = buildCollapsedSleepSummaryModel(
      createGuidance(past, [nap]),
      2_500,
    );

    expect(result.nearestWindow).toBe(nap);
    expect(result.action).toEqual({ at: 2_900, kind: 'prepare-nap' });
  });

  it('야간 전환 중에는 전환 종료 뒤 준비할 시각만 안내해요', () => {
    const nap = createWindow('보충 수면', 1_000, 2_000, 'pre-night-nap');
    const guidance = createGuidance(nap);
    guidance.transition = {
      id: 'transition',
      kind: 'first-night-awake',
      title: '야간 전환',
      startAt: 400,
      endAt: 800,
      nextSleepStartAt: 1_000,
      nextWakeAt: 2_000,
      guidance: '전환 안내',
      relatedDateKey: '2026-08-09',
      shiftTypeId: 'night',
      shiftName: '야간',
    };

    expect(buildCollapsedSleepSummaryModel(guidance, 500).action).toEqual({
      at: 800,
      kind: 'prepare-nap',
    });
  });
});
