import type { ResolvedThemeMode, ThemeMode } from '@/models/app-data';

export function resolveThemeMode(
  preference: ThemeMode,
  systemColorScheme: 'light' | 'dark' | 'unspecified' | null | undefined,
): ResolvedThemeMode {
  if (preference !== 'system') return preference;
  return systemColorScheme === 'dark' ? 'dark' : 'light';
}

// 새 팔레트를 즉시 적용한 뒤 이전 배경색을 아주 옅게 걷어 내요.
// 화면을 어둡게 덮는 단계가 없어 전환 중에도 글자 대비를 유지해요.
export const THEME_COVER_DURATION_MS = 0;
export const THEME_BLEND_DURATION_MS = 180;
export const THEME_COVER_OPACITY = 0.16;
export const THEME_REQUEST_COALESCE_MS = 32;

export type ThemeTransitionPlan = {
  shouldAnimate: boolean;
  coverOpacity: number;
  coalesceDurationMs: number;
};

export function resolveThemeTransitionPlan(
  previousMode: ResolvedThemeMode,
  nextMode: ResolvedThemeMode,
  reduceMotion: boolean,
): ThemeTransitionPlan {
  const shouldAnimate = !reduceMotion && previousMode !== nextMode;
  return {
    shouldAnimate,
    coverOpacity: shouldAnimate ? THEME_COVER_OPACITY : 0,
    coalesceDurationMs: shouldAnimate ? THEME_REQUEST_COALESCE_MS : 0,
  };
}

export function resolveNativeColorScheme(
  preference: ThemeMode,
  resolvedMode: ResolvedThemeMode,
): ResolvedThemeMode | 'unspecified' {
  return preference === 'system' ? 'unspecified' : resolvedMode;
}

export function getThemeBlendInitialOpacity(
  previousMode: ResolvedThemeMode,
  nextMode: ResolvedThemeMode,
  reduceMotion: boolean,
) {
  return resolveThemeTransitionPlan(previousMode, nextMode, reduceMotion)
    .coverOpacity;
}
