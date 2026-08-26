import { describe, expect, it, vi } from 'vitest';

import {
  LAUNCH_BRAND_LAYOUT,
  LAUNCH_ENTRY_TRANSFORM,
  LAUNCH_TRANSITION_TIMING,
} from '../launch-transition-overlay';

vi.mock('react-native', () => ({
  Animated: {
    Value: class {},
    View: 'AnimatedView',
    delay: vi.fn(),
    parallel: vi.fn(),
    sequence: vi.fn(),
    timing: vi.fn(),
  },
  Easing: {
    cubic: 'cubic',
    quad: 'quad',
    inOut: vi.fn((value) => value),
    out: vi.fn((value) => value),
  },
  Platform: { OS: 'web' },
  Image: 'Image',
  StyleSheet: {
    create: <T,>(styles: T) => styles,
  },
}));

describe('시작 화면 브랜드 배치', () => {
  it('텍스트 없이 240dp 로고만 화면 중앙에 표시합니다', () => {
    expect(LAUNCH_BRAND_LAYOUT).toEqual({
      markSize: 240,
    });
  });

  it('화살표와 바늘은 완성된 대칭 로고로만 수렴합니다', () => {
    expect(LAUNCH_ENTRY_TRANSFORM).toEqual({
      arrowsRotation: ['-18deg', '0deg'],
      arrowsScale: [0.94, 1],
      handsScale: [0.88, 1],
    });
  });
});

describe('브랜드 시작 화면 전환 시간', () => {
  it('대칭 화살표와 바늘을 완성한 뒤 총 2120ms 동안 표시합니다', () => {
    const total =
      Math.max(
        LAUNCH_TRANSITION_TIMING.arrowsEntry,
        LAUNCH_TRANSITION_TIMING.handsDelay +
          LAUNCH_TRANSITION_TIMING.handsEntry,
      ) +
      LAUNCH_TRANSITION_TIMING.fullMotionHold +
      LAUNCH_TRANSITION_TIMING.fullMotionExit;

    expect(LAUNCH_TRANSITION_TIMING).toMatchObject({
      arrowsEntry: 760,
      handsDelay: 200,
      handsEntry: 520,
      fullMotionHold: 1_000,
      fullMotionExit: 360,
    });
    expect(total).toBe(2_120);
  });

  it('동작 줄이기는 즉시 표시하고 140ms 종료만 사용합니다', () => {
    expect(LAUNCH_TRANSITION_TIMING.reducedMotionExit).toBe(140);
  });
});
