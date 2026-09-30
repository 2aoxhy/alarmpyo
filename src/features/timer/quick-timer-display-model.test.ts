import { describe, expect, it } from 'vitest';

import type { QuickTimerDuration, QuickTimerStatus } from './quick-timer-controller';
import {
  createQuickTimerDisplayObservation,
  getQuickTimerCountdownPresentation,
  getQuickTimerObservationKey,
  type QuickTimerDisplayClock,
} from './quick-timer-display-model';
import { getQuickTimerDisplayLabel } from './quick-timer-model';

const observedClock = {
  monotonic: 10_000,
  wall: new Date(2026, 8, 13, 10, 1, 0, 50).getTime(),
};

function scheduled(durationMinutes: QuickTimerDuration = 15): QuickTimerStatus {
  return {
    active: true,
    durationMinutes,
    fireAt: observedClock.wall + durationMinutes * 60_000,
    isRepeat: false,
    remainingMillis: durationMinutes * 60_000,
    requiredAction: 'none',
    startedAt: observedClock.wall,
    state: 'scheduled',
    storageHealth: 'normal',
    supported: true,
  };
}

function present(status: QuickTimerStatus, clock: QuickTimerDisplayClock = observedClock) {
  const observation = createQuickTimerDisplayObservation(status, observedClock);
  return getQuickTimerCountdownPresentation({
    anchor: observation.anchor,
    clock,
    observedClock: observation.clock,
    label: getQuickTimerDisplayLabel(observation.status),
    paused: observation.status.state === 'paused',
  });
}

describe('타이머 표시 관측값', () => {
  it('상태·남은 시간·시각·관측 키를 독립된 불변 값으로 함께 보관합니다', () => {
    const status = scheduled();
    const clock = { ...observedClock };
    const observation = createQuickTimerDisplayObservation(status, clock);
    status.remainingMillis = 0;
    status.durationMinutes = 60;
    clock.wall = 0;

    expect(observation.status.durationMinutes).toBe(15);
    expect(observation.status.remainingMillis).toBe(900_000);
    expect(observation.anchor.remainingMillis).toBe(900_000);
    expect(observation.clock.wall).toBe(observedClock.wall);
    expect(observation.key).toBe(getQuickTimerObservationKey(observation.status));
    for (const value of [observation, observation.status, observation.anchor, observation.clock]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it.each([1, 15, 23, 30, 45, 60] as const)(
    '%i분으로 변경한 첫 프레임은 이전 tick이 아닌 새 관측 시각을 씁니다',
    (duration) => {
      const presentation = present(scheduled(duration), {
        monotonic: observedClock.monotonic - 500,
        wall: observedClock.wall - 500,
      });

      expect(presentation.countdown).toBe(`${duration}분 남음`);
      const minute = (duration + 1) % 60;
      const hour = duration === 60 ? 11 : 10;
      expect(presentation.detail).toBe(
        `오늘 오전 ${hour}:${String(minute).padStart(2, '0')}에 울립니다.`,
      );
      expect(presentation.accessibilityLabel).toContain(presentation.detail);
      expect(presentation.accessibilityLabel).toContain(presentation.countdown);
    },
  );

  it('같은 상태를 다시 조회해도 기존 문자열을 비우지 않고 새 기준을 적용합니다', () => {
    const first = createQuickTimerDisplayObservation(scheduled(), observedClock);
    const nextClock = { monotonic: 15_000, wall: observedClock.wall + 5_000 };
    const next = createQuickTimerDisplayObservation({
      ...scheduled(), remainingMillis: 895_000,
    }, nextClock);
    expect(next.key).toBe(first.key);
    const presentation = getQuickTimerCountdownPresentation({
      anchor: next.anchor,
      observedClock: next.clock,
      clock: observedClock,
      label: getQuickTimerDisplayLabel(next.status),
      paused: false,
    });
    expect(presentation.remainingMillis).toBe(895_000);
    expect(presentation.detail).toBe('오늘 오전 10:16에 울립니다.');
    expect(presentation.countdown).toBe('15분 남음');
  });

  it('새 tick과 기기 시각 변경은 울림 시각만 바꾸고 남은 시간은 monotonic 기준입니다', () => {
    const presentation = present(scheduled(1), {
      monotonic: observedClock.monotonic + 5_000,
      wall: observedClock.wall + 3_600_000 + 5_000,
    });
    expect(presentation.countdown).toBe('55초 남음');
    expect(presentation.detail).toBe('오늘 오전 11:02에 울립니다.');
  });

  it('일시정지는 남은 값을 고정하며 재개·만료까지 세 표시 문구를 유지합니다', () => {
    const later = { monotonic: 20_000, wall: observedClock.wall + 10_000 };
    const paused = present({
      ...scheduled(), active: false, state: 'paused', remainingMillis: 45_000,
    }, later);
    const resumed = present({ ...scheduled(), remainingMillis: 45_000 }, later);
    const expired = present({ ...scheduled(), state: 'ringing', remainingMillis: 0 }, later);

    expect(paused.countdown).toBe('45초 남음');
    expect(paused.detail).toBe('재개하면 남은 시간부터 다시 시작합니다.');
    expect(resumed.countdown).toBe('35초 남음');
    expect(expired.countdown).toBe('0초 남음');
    for (const presentation of [paused, resumed, expired]) {
      for (const value of [presentation.countdown, presentation.detail, presentation.accessibilityLabel]) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});
