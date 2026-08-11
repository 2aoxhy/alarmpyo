import { describe, expect, it, vi } from 'vitest';

import { shouldReduceMotion } from '../use-reduce-motion';

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    addEventListener: vi.fn(),
    isReduceMotionEnabled: vi.fn(),
  },
}));

describe('동작 줄이기 기본값', () => {
  it('기기 설정을 확인하기 전에는 애니메이션을 보수적으로 멈춥니다', () => {
    expect(shouldReduceMotion({ enabled: false, known: false })).toBe(true);
  });

  it('확인된 기기 설정을 그대로 반영합니다', () => {
    expect(shouldReduceMotion({ enabled: true, known: true })).toBe(true);
    expect(shouldReduceMotion({ enabled: false, known: true })).toBe(false);
  });
});
