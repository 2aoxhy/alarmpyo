export const lightPalette = {
  ink: '#171A2B',
  inkMuted: '#51586A',
  inkSoft: '#626A7C',
  canvas: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceSoft: '#EEF1F6',
  line: '#D8DDE8',
  controlLine: '#8992A6',
  disabledSurface: '#E7EAF1',
  disabledInk: '#676E7E',
  mint: '#087665',
  mintDark: '#055E50',
  mintSoft: '#DDF7F0',
  olive: '#64700F',
  oliveSoft: '#F1F4D2',
  coral: '#B83A45',
  coralSoft: '#FDE9EC',
  amber: '#875900',
  amberSoft: '#FFF1D2',
  blue: '#176397',
  blueSoft: '#E1F1FF',
  violet: '#654EC8',
  violetSoft: '#EEEAFE',
  navy: '#4437B8',
  indigo: '#5542C7',
  indigoDark: '#392D91',
  indigoSoft: '#EAE7FB',
  lilac: '#8769DF',
  lilacSoft: '#F1EDFD',
  white: '#FFFFFF',
  danger: '#B32646',
  dangerSoft: '#FCE8ED',
  shadowColor: '#171A2B',
  transparent: 'transparent',
} as const;

export type AppPalette = { [Key in keyof typeof lightPalette]: string };

export const darkPalette: AppPalette = {
  ink: '#F7F8FC',
  inkMuted: '#C0C5D2',
  inkSoft: '#9EA5B5',
  canvas: '#0B0F17',
  surface: '#151A24',
  surfaceSoft: '#202632',
  line: '#303746',
  controlLine: '#737C90',
  disabledSurface: '#292F3C',
  disabledInk: '#AEB4C2',
  mint: '#58D9BC',
  mintDark: '#7AE6D0',
  mintSoft: '#123D36',
  olive: '#D5E477',
  oliveSoft: '#313819',
  coral: '#FF929A',
  coralSoft: '#402126',
  amber: '#F0C36A',
  amberSoft: '#3E311A',
  blue: '#89CEFF',
  blueSoft: '#173650',
  violet: '#BAACFF',
  violetSoft: '#30294D',
  navy: '#7E70E8',
  indigo: '#6857D6',
  indigoDark: '#C9C0FF',
  indigoSoft: '#2C2748',
  lilac: '#C1A9FF',
  lilacSoft: '#252038',
  white: '#FFFFFF',
  danger: '#FF879F',
  dangerSoft: '#421F2A',
  shadowColor: '#000000',
  transparent: 'transparent',
};

/** 저장 데이터의 근무 색상 기본값처럼 테마와 무관한 곳은 라이트 팔레트를 사용해요. */
export const palette = lightPalette;

export function colorWithAlpha(color: string, alpha: number): string {
  const normalized = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return color;
  const value = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return `${normalized}${value.toString(16).padStart(2, '0').toUpperCase()}`;
}

export const radii = {
  small: 12,
  medium: 18,
  large: 26,
  xlarge: 30,
  pill: 999,
} as const;

export const spacing = {
  tiny: 4,
  small: 8,
  medium: 12,
  large: 16,
  xlarge: 24,
  xxlarge: 32,
} as const;

export const shadow = {
  shadowColor: '#171A2B',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 20,
  elevation: 3,
} as const;
