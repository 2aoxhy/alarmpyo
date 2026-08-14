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
  weekendSaturday: '#176397',
  violet: '#59636F',
  violetSoft: '#E8EBEE',
  navy: '#4E5965',
  indigo: '#46515D',
  indigoDark: '#313A44',
  indigoSoft: '#E7EAED',
  lilac: '#67717C',
  lilacSoft: '#ECEEF0',
  white: '#FFFFFF',
  danger: '#B32646',
  dangerSoft: '#FCE8ED',
  shadowColor: '#171A2B',
  transparent: 'transparent',
} as const;

export type AppPalette = { [Key in keyof typeof lightPalette]: string };

export const darkPalette: AppPalette = {
  ink: '#FAFAFB',
  inkMuted: '#D9DDE3',
  inkSoft: '#B5BDC8',
  canvas: '#101214',
  surface: '#181B1F',
  surfaceSoft: '#22262B',
  line: '#343A41',
  controlLine: '#737D89',
  disabledSurface: '#2B3036',
  disabledInk: '#8C949F',
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
  weekendSaturday: '#9AC7FF',
  violet: '#C7D7EB',
  violetSoft: '#2B3036',
  navy: '#66717D',
  indigo: '#616A75',
  indigoDark: '#C8CED6',
  indigoSoft: '#2A2F35',
  lilac: '#D0D5DB',
  lilacSoft: '#272B30',
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
