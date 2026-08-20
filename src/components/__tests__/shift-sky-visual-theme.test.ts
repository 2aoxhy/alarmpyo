// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolveShiftHeroTheme,
  resolveShiftVisualRole,
  type ShiftVisualRole,
} from '../../design-system/shift-visual-theme';

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(first: string, second: string) {
  const brighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (brighter + 0.05) / (darker + 0.05);
}

describe('오늘 히어로 근무 의미색 계약', () => {
  it.each([
    ['day', 'day'],
    ['evening', 'evening'],
    ['night', 'night'],
    ['substitute-day', 'substitute-day'],
    ['substitute-night', 'substitute-night'],
  ] as const)('%s 근무를 %s 역할로 해석합니다', (id, expected) => {
    expect(resolveShiftVisualRole({ id, isOff: false })).toBe(expected);
  });

  it('휴무·특별 일정·사용자 근무를 서로 다른 역할로 해석합니다', () => {
    expect(resolveShiftVisualRole({ id: 'off', isOff: true })).toBe('off');
    expect(resolveShiftVisualRole({ id: 'day', isOff: false }, true)).toBe(
      'special',
    );
    expect(resolveShiftVisualRole({ id: 'custom-a', isOff: false })).toBe(
      'custom',
    );
  });

  it.each([
    'day',
    'evening',
    'night',
    'off',
    'substitute-day',
    'substitute-night',
    'special',
    'custom',
  ] satisfies ShiftVisualRole[])('%s 배경의 흰색 본문 대비가 4.5:1 이상입니다', (role) => {
    const theme = resolveShiftHeroTheme(role, '#AABBCC');
    for (const background of theme.gradient) {
      expect(contrast(theme.foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('대체근무는 주·야간 배경을 유지하면서 호박색 강조를 사용합니다', () => {
    const day = resolveShiftHeroTheme('day');
    const night = resolveShiftHeroTheme('night');
    const substituteDay = resolveShiftHeroTheme('substitute-day');
    const substituteNight = resolveShiftHeroTheme('substitute-night');

    expect(substituteDay.gradient).toEqual(day.gradient);
    expect(substituteNight.gradient).toEqual(night.gradient);
    expect(substituteDay.accent).toBe('#F0C36A');
    expect(substituteNight.accent).toBe('#F0C36A');
  });

  it('사용자 근무색은 저장값을 바꾸지 않고 강조색으로만 사용합니다', () => {
    expect(resolveShiftHeroTheme('custom', '#12ab34')).toMatchObject({
      accent: '#12AB34',
      gradient: ['#2A2F35', '#181B1F'],
    });
    expect(resolveShiftHeroTheme('custom', 'invalid').accent).toBe('#C8CED6');
    expect(resolveShiftHeroTheme('custom', '#101214').accent).toBe('#C8CED6');
  });

  it('Today는 벽시계 배경이 아니라 실제 적용 근무를 전달합니다', () => {
    const screen = readFileSync(
      resolve(process.cwd(), 'src/app/(tabs)/index.tsx'),
      'utf8',
    );
    const hero = readFileSync(
      resolve(process.cwd(), 'src/features/today/today-hero.tsx'),
      'utf8',
    );

    expect(screen).toContain('shift={viewModel.current?.shift ?? viewModel.todayShift}');
    expect(hero).toContain('resolveShiftVisualRole(shift, Boolean(activeException))');
    expect(hero).not.toContain('getShiftSkyGradient(now.getHours())');
  });
});
