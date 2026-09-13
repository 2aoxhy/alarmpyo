import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuickTimerCountdown } from './quick-timer-countdown';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  memo: <T,>(component: T) => component,
  useEffect: vi.fn(),
  useRef: <T,>(current: T) => ({ current }),
  useState: <T,>(initial: T | (() => T)) => [
    typeof initial === 'function' ? (initial as () => T)() : initial,
    vi.fn(),
  ],
}));
vi.mock('react-native', () => ({
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('@/components/ui-kit', () => ({ AppText: 'AppText' }));
vi.mock('@/design-system', () => ({ space: { sm: 8, xs: 4 } }));

function textValues(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(textValues);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (String(node.type) === 'AppText') return [String(node.props.children)];
  return textValues(node.props.children);
}

describe('타이머 카운트다운 텍스트 트리', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(5_000);
    vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 8, 13, 10, 0).getTime());
  });
  afterEach(() => vi.restoreAllMocks());

  it('프리셋·직접 입력으로 변경한 모든 시간의 라벨·남은 시간·울림 시각을 유지해요', () => {
    for (const durationMinutes of [15, 30, 45, 23, 60, 1]) {
      const tree = QuickTimerCountdown({
        active: true,
        anchor: { remainingMillis: durationMinutes * 60_000, observedAtMonotonic: 5_000 },
        countdownFontSize: 48,
        label: `${durationMinutes}분 타이머`,
        onExpired: vi.fn(),
        observationKey: `replacement-${durationMinutes}`,
        observedClock: { monotonic: 5_000, wall: Date.now() },
        screenActive: true,
      });

      expect(textValues(tree)).toEqual([
        `${durationMinutes}분 타이머`,
        `${durationMinutes}분 남음`,
        expect.stringContaining('에 울립니다.'),
      ]);
      expect(isValidElement(tree) && tree.props).toMatchObject({
        collapsable: false,
        testID: 'quick-timer-countdown',
      });
    }
  });

  it('일시정지·화면 비활성·만료 상태에도 남은 시간 텍스트를 비우지 않아요', () => {
    for (const [paused, screenActive, remainingMillis, expected] of [
      [true, true, 90_000, '2분 남음'],
      [false, false, 45_000, '45초 남음'],
      [false, true, 0, '0초 남음'],
    ] as const) {
      const tree = QuickTimerCountdown({
        active: !paused,
        anchor: { remainingMillis, observedAtMonotonic: 5_000 },
        countdownFontSize: 48,
        label: '15분 타이머',
        onExpired: vi.fn(),
        observationKey: `state-${paused}-${screenActive}-${remainingMillis}`,
        observedClock: { monotonic: 5_000, wall: Date.now() },
        paused,
        screenActive,
      });

      expect(textValues(tree)).toHaveLength(3);
      expect(textValues(tree)[1]).toBe(expected);
      expect(textValues(tree).every((value) => value.length > 0)).toBe(true);
    }
  });
});
