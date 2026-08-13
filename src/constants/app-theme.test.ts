import { describe, expect, it } from 'vitest';

import { darkPalette, lightPalette, type AppPalette } from './app-theme';

function relativeLuminance(color: string): number {
  const value = color.replace('#', '');
  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function expectContrast(
  palette: AppPalette,
  foreground: keyof AppPalette,
  background: keyof AppPalette,
  minimum: number,
) {
  expect(
    contrastRatio(palette[foreground], palette[background]),
    `${String(foreground)}/${String(background)} 대비`,
  ).toBeGreaterThanOrEqual(minimum);
}

const feedbackPairs = [
  ['mintDark', 'mintSoft'],
  ['violet', 'violetSoft'],
  ['coral', 'coralSoft'],
  ['amber', 'amberSoft'],
  ['blue', 'blueSoft'],
  ['olive', 'oliveSoft'],
  ['danger', 'dangerSoft'],
] as const satisfies readonly (readonly [keyof AppPalette, keyof AppPalette])[];

describe('앱 색상 대비', () => {
  it.each([
    ['라이트', lightPalette],
    ['다크', darkPalette],
  ] as const)('%s 모드의 본문을 선명하게 표시해요', (_name, palette) => {
    expectContrast(palette, 'ink', 'canvas', 4.5);
    expectContrast(palette, 'inkMuted', 'canvas', 4.5);
    expectContrast(palette, 'inkSoft', 'canvas', 4.5);
    expectContrast(palette, 'ink', 'surface', 4.5);
    expectContrast(palette, 'inkMuted', 'surface', 4.5);
    expectContrast(palette, 'inkSoft', 'surface', 4.5);
  });

  it('라이트 모드의 주요 동작과 오늘 표시가 읽기 쉬워요', () => {
    expectContrast(lightPalette, 'white', 'indigo', 4.5);
    expectContrast(lightPalette, 'white', 'mint', 4.5);
  });

  it('다크 모드의 주요 동작과 스위치 손잡이가 구분돼요', () => {
    expectContrast(darkPalette, 'white', 'indigo', 4.5);
    expectContrast(darkPalette, 'indigo', 'surface', 3);
    expectContrast(darkPalette, 'indigoDark', 'indigoSoft', 4.5);
    expectContrast(darkPalette, 'canvas', 'mint', 4.5);
  });

  it.each([
    ['라이트', lightPalette],
    ['다크', darkPalette],
  ] as const)('%s 모드의 의미 색상 배지가 읽기 쉬워요', (_name, palette) => {
    for (const [foreground, background] of feedbackPairs) {
      expectContrast(palette, foreground, background, 4.5);
    }
  });

  it.each([
    ['라이트', lightPalette],
    ['다크', darkPalette],
  ] as const)('%s 모드의 달력 경계가 분명해요', (_name, palette) => {
    expectContrast(palette, 'controlLine', 'surface', 3);
  });
});
