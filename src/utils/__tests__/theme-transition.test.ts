import { describe, expect, it } from 'vitest';

import {
  THEME_BLEND_DURATION_MS,
  THEME_COVER_DURATION_MS,
  THEME_COVER_OPACITY,
  THEME_REQUEST_COALESCE_MS,
  getThemeBlendInitialOpacity,
  resolveNativeColorScheme,
  resolveThemeMode,
  resolveThemeTransitionPlan,
} from '../theme-transition';

describe('theme transition', () => {
  it('휴대폰 설정을 실제 라이트·다크 색상으로 안전하게 해석해요', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark');
    expect(resolveThemeMode('system', 'light')).toBe('light');
    expect(resolveThemeMode('system', null)).toBe('light');
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
  });

  it('화면을 덮지 않고 짧고 부드럽게 전환해요', () => {
    expect(THEME_COVER_DURATION_MS).toBe(0);
    expect(THEME_BLEND_DURATION_MS).toBeGreaterThanOrEqual(150);
    expect(THEME_BLEND_DURATION_MS).toBeLessThanOrEqual(200);
    expect(THEME_COVER_OPACITY).toBeLessThanOrEqual(0.2);
    expect(THEME_REQUEST_COALESCE_MS).toBeGreaterThan(0);
    expect(THEME_REQUEST_COALESCE_MS).toBeLessThanOrEqual(60);
    expect(getThemeBlendInitialOpacity('light', 'dark', false)).toBe(0.16);
    expect(getThemeBlendInitialOpacity('dark', 'light', false)).toBe(0.16);
  });

  it('연속 요청은 짧게 합치고 애니메이션 줄이기는 즉시 적용해요', () => {
    expect(resolveThemeTransitionPlan('light', 'dark', false)).toEqual({
      shouldAnimate: true,
      coverOpacity: THEME_COVER_OPACITY,
      coalesceDurationMs: THEME_REQUEST_COALESCE_MS,
    });
    expect(resolveThemeTransitionPlan('light', 'dark', true)).toEqual({
      shouldAnimate: false,
      coverOpacity: 0,
      coalesceDurationMs: 0,
    });
    expect(getThemeBlendInitialOpacity('light', 'dark', true)).toBe(0);
    expect(getThemeBlendInitialOpacity('dark', 'dark', false)).toBe(0);
  });

  it('앱 테마와 시스템 UI에 같은 설정을 전달해요', () => {
    expect(resolveNativeColorScheme('dark', 'dark')).toBe('dark');
    expect(resolveNativeColorScheme('light', 'light')).toBe('light');
    expect(resolveNativeColorScheme('system', 'dark')).toBe('unspecified');
  });
});
