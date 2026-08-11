import { describe, expect, it, vi } from 'vitest';

import {
  LAUNCH_TRANSITION_TIMING,
  resolveLaunchFontMode,
  shouldMountLaunchBrand,
} from '../launch-transition-overlay';

vi.mock('react-native', () => ({
  Animated: {
    Value: class {},
    View: 'AnimatedView',
    delay: vi.fn(),
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
  StyleSheet: {
    create: <T,>(styles: T) => styles,
  },
}));
vi.mock('@/components/ui-kit', () => ({ AppText: () => null }));

describe('텍스트 전용 시작 화면 전환 시간', () => {
  it('일반 전환은 약 1.6초를 유지하고 마지막 종료는 약 0.3초예요', () => {
    const total =
      LAUNCH_TRANSITION_TIMING.fullMotionDuration +
      LAUNCH_TRANSITION_TIMING.fullMotionHold +
      LAUNCH_TRANSITION_TIMING.fullMotionExit;

    expect(total).toBeGreaterThanOrEqual(1_600);
    expect(total).toBeLessThanOrEqual(1_800);
    expect(LAUNCH_TRANSITION_TIMING.fullMotionExit).toBeGreaterThanOrEqual(280);
    expect(LAUNCH_TRANSITION_TIMING.fullMotionExit).toBeLessThanOrEqual(340);
  });

  it('동작 줄이기는 별도 대기 없이 짧은 종료만 사용해요', () => {
    expect(LAUNCH_TRANSITION_TIMING.reducedMotionExit).toBeLessThanOrEqual(180);
  });
});

describe('시작 화면 글꼴 준비 상태', () => {
  it('WantedSans를 불러오는 동안 브랜드 문구를 마운트하지 않아요', () => {
    const fontMode = resolveLaunchFontMode(false, false);

    expect(fontMode).toBe('pending');
    expect(shouldMountLaunchBrand(fontMode)).toBe(false);
  });

  it('WantedSans를 불러온 뒤 브랜드 문구를 새로 마운트해요', () => {
    const fontMode = resolveLaunchFontMode(true, false);

    expect(fontMode).toBe('wanted');
    expect(shouldMountLaunchBrand(fontMode)).toBe(true);
  });

  it('글꼴 오류가 발생하면 시스템 글꼴 폴백으로 진행해요', () => {
    const fontMode = resolveLaunchFontMode(false, true);

    expect(fontMode).toBe('fallback');
    expect(shouldMountLaunchBrand(fontMode)).toBe(true);
  });

  it('오류 기록이 남아 있어도 WantedSans 로드를 우선해요', () => {
    expect(resolveLaunchFontMode(true, true)).toBe('wanted');
  });
});
