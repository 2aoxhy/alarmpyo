import { describe, expect, it, vi } from 'vitest';

import {
  LAUNCH_BRAND_LAYOUT,
  LAUNCH_TRANSITION_TIMING,
  resolveLaunchBrandVisibility,
  resolveLaunchFontMode,
  resolveFrozenLaunchFontMode,
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
  Image: 'Image',
  StyleSheet: {
    create: <T,>(styles: T) => styles,
  },
}));
vi.mock('@/components/ui-kit', () => ({ AppText: () => null }));

describe('시작 화면 브랜드 배치', () => {
  it('로고와 워드마크 묶음의 중앙 정렬 계약을 유지합니다', () => {
    expect(LAUNCH_BRAND_LAYOUT).toEqual({
      groupHeight: 288,
      markSize: 240,
      wordmarkFontSize: 60,
      wordmarkLineHeight: 72,
      wordmarkTop: 196,
    });
  });
});

describe('브랜드 시작 화면 전환 시간', () => {
  it('로고와 워드마크를 순차 표시하면서 총 1620ms를 유지합니다', () => {
    const total =
      LAUNCH_TRANSITION_TIMING.markFade +
      LAUNCH_TRANSITION_TIMING.wordmarkFade +
      LAUNCH_TRANSITION_TIMING.fullMotionHold +
      LAUNCH_TRANSITION_TIMING.fullMotionExit;

    expect(LAUNCH_TRANSITION_TIMING).toMatchObject({
      markFade: 440,
      wordmarkFade: 440,
      fullMotionHold: 440,
      fullMotionExit: 300,
    });
    expect(total).toBe(1_620);
  });

  it('동작 줄이기는 즉시 표시하고 140ms 종료만 사용합니다', () => {
    expect(LAUNCH_TRANSITION_TIMING.reducedMotionExit).toBe(140);
  });
});

describe('시작 화면 글꼴 준비 상태', () => {
  it('WantedSans를 불러오는 동안 워드마크를 표시하지 않습니다', () => {
    const fontMode = resolveLaunchFontMode(false, false);

    expect(fontMode).toBe('pending');
    expect(resolveLaunchBrandVisibility(fontMode)).toEqual({
      mark: true,
      wordmark: false,
    });
  });

  it('WantedSans를 불러온 뒤 브랜드 문구를 표시합니다', () => {
    const fontMode = resolveLaunchFontMode(true, false);

    expect(fontMode).toBe('wanted');
    expect(resolveLaunchBrandVisibility(fontMode)).toEqual({
      mark: true,
      wordmark: true,
    });
  });

  it('글꼴 오류가 발생하면 시스템 글꼴 폴백으로 진행합니다', () => {
    const fontMode = resolveLaunchFontMode(false, true);

    expect(fontMode).toBe('fallback');
    expect(resolveLaunchBrandVisibility(fontMode)).toEqual({
      mark: true,
      wordmark: true,
    });
  });

  it('오류 기록이 남아 있어도 WantedSans 로드를 우선합니다', () => {
    expect(resolveLaunchFontMode(true, true)).toBe('wanted');
  });

  it('시작 시점에 결정한 폰트를 전환 도중 교체하지 않습니다', () => {
    expect(resolveFrozenLaunchFontMode(null, 'pending')).toBe('fallback');
    expect(resolveFrozenLaunchFontMode(null, 'fallback')).toBe('fallback');
    expect(resolveFrozenLaunchFontMode('fallback', 'wanted')).toBe('fallback');
    expect(resolveFrozenLaunchFontMode('wanted', 'fallback')).toBe('wanted');
  });
});
