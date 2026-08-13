import type { TextStyle } from 'react-native';

import {
  colorWithAlpha,
  radii as legacyRadii,
  spacing as legacySpacing,
  type AppPalette,
} from '../constants/app-theme';
import { fontFamily } from '../constants/typography';

/**
 * 기존 화면과 수치를 공유하는 의미 기반 간격 토큰이에요.
 * 화면을 한 번에 바꾸지 않아도 새 컴포넌트부터 일관된 간격을 적용할 수 있어요.
 */
export const space = {
  none: 0,
  xxs: 2,
  xs: legacySpacing.tiny,
  sm: legacySpacing.small,
  md: legacySpacing.medium,
  lg: legacySpacing.large,
  xl: legacySpacing.xlarge,
  xxl: legacySpacing.xxlarge,
  xxxl: 40,
} as const;

export const radius = {
  xs: 8,
  sm: legacyRadii.small,
  md: legacyRadii.medium,
  lg: legacyRadii.large,
  xl: legacyRadii.xlarge,
  full: legacyRadii.pill,
} as const;

export const size = {
  minimumTouchTarget: 48,
  regularControl: 52,
  largeControl: 56,
  iconSmall: 18,
  iconMedium: 22,
  iconLarge: 26,
  contentMaxWidth: 600,
} as const;

/**
 * 눌림·비활성·진행 중 상태가 화면마다 달라지지 않도록 공유하는 상호작용 토큰이에요.
 */
export const interaction = {
  pressedOpacity: 0.76,
  emphasizedPressedOpacity: 0.82,
  disabledOpacity: 0.64,
  loadingOpacity: 0.72,
} as const;

export const motion = {
  instant: 0,
  fast: 140,
  standard: 220,
  screen: 280,
  easing: {
    enter: 'cubic-bezier(0.2, 0, 0, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const;

export function resolveMotionDuration(
  duration: number,
  reduceMotion: boolean,
): number {
  return reduceMotion ? motion.instant : Math.max(motion.instant, duration);
}

export const typeScale = {
  display: {
    fontFamily: fontFamily.heading,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -1,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 26,
    lineHeight: 33,
    letterSpacing: -0.7,
  },
  heading: {
    fontFamily: fontFamily.heading,
    fontSize: 20,
    lineHeight: 27,
    letterSpacing: -0.35,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: fontFamily.label,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
} as const satisfies Record<string, TextStyle>;

export type SemanticColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceSelected: string;
  surfaceDisabled: string;
  text: string;
  textMuted: string;
  textSoft: string;
  textDisabled: string;
  border: string;
  borderStrong: string;
  focus: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  onAccent: string;
  positive: string;
  positiveSoft: string;
  onPositive: string;
  info: string;
  infoSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
};

/** AppPalette를 화면의 역할에 맞는 색상 이름으로 바꿔 줘요. */
export function createSemanticColors(
  palette: AppPalette,
  isDark: boolean,
): SemanticColors {
  return {
    background: palette.canvas,
    surface: palette.surface,
    surfaceMuted: palette.surfaceSoft,
    surfaceSelected: palette.indigoSoft,
    surfaceDisabled: palette.disabledSurface,
    text: palette.ink,
    textMuted: palette.inkMuted,
    textSoft: palette.inkSoft,
    textDisabled: palette.disabledInk,
    border: palette.line,
    borderStrong: palette.controlLine,
    focus: isDark ? palette.lilac : palette.indigo,
    accent: isDark ? palette.indigoDark : palette.indigo,
    accentStrong: palette.indigoDark,
    accentSoft: palette.indigoSoft,
    onAccent: palette.white,
    positive: palette.mint,
    positiveSoft: palette.mintSoft,
    onPositive: isDark ? palette.canvas : palette.white,
    info: palette.blue,
    infoSoft: palette.blueSoft,
    warning: palette.amber,
    warningSoft: palette.amberSoft,
    danger: palette.danger,
    dangerSoft: palette.dangerSoft,
    overlay: colorWithAlpha(isDark ? '#000000' : palette.ink, isDark ? 0.68 : 0.42),
  };
}

export function isDarkPalette(palette: AppPalette): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(palette.canvas.trim());
  if (!match) return false;
  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
  const linearize = (channel: number) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance =
    0.2126 * linearize(red) +
    0.7152 * linearize(green) +
    0.0722 * linearize(blue);
  return luminance < 0.35;
}
