import { describe, expect, it } from 'vitest';

import { darkPalette, lightPalette } from '../constants/app-theme';

import {
  createSemanticColors,
  interaction,
  isDarkPalette,
  motion,
  resolveTextTone,
  resolveMotionDuration,
  size,
} from './tokens';

describe('design-system tokens', () => {
  it('기존 팔레트를 의미 기반 색상으로 변환해요', () => {
    const light = createSemanticColors(lightPalette, false);
    const dark = createSemanticColors(darkPalette, true);

    expect(light.background).toBe(lightPalette.canvas);
    expect(light.focus).toBe(lightPalette.indigo);
    expect(light.onPositive).toBe(lightPalette.white);
    expect(dark.background).toBe(darkPalette.canvas);
    expect(dark.focus).toBe(darkPalette.lilac);
    expect(dark.accent).toBe(darkPalette.indigo);
    expect(dark.onAccent).toBe(darkPalette.white);
    expect(dark.onPositive).toBe(darkPalette.canvas);
    expect(dark.weekendSaturday).toBe(darkPalette.weekendSaturday);
  });

  it('본문 계층을 색상 이름이 아닌 읽기 역할로 해석해요', () => {
    expect(resolveTextTone(darkPalette, 'primary')).toBe(darkPalette.ink);
    expect(resolveTextTone(darkPalette, 'secondary')).toBe(darkPalette.inkMuted);
    expect(resolveTextTone(darkPalette, 'tertiary')).toBe(darkPalette.inkSoft);
    expect(resolveTextTone(darkPalette, 'disabled')).toBe(darkPalette.disabledInk);
    expect(resolveTextTone(darkPalette, 'inverse')).toBe(darkPalette.white);
  });

  it('밝기 기준으로 라이트와 다크 팔레트를 구분해요', () => {
    expect(isDarkPalette(lightPalette)).toBe(false);
    expect(isDarkPalette(darkPalette)).toBe(true);
  });

  it('애니메이션 줄이기 설정에서는 전환 시간을 없애요', () => {
    expect(resolveMotionDuration(motion.standard, false)).toBe(220);
    expect(resolveMotionDuration(motion.standard, true)).toBe(0);
  });

  it('터치 영역은 안드로이드 접근성 권장값 이상이에요', () => {
    expect(size.minimumTouchTarget).toBeGreaterThanOrEqual(48);
  });

  it('상호작용 상태는 글자를 읽을 수 있는 범위로 통일해요', () => {
    expect(interaction.pressedOpacity).toBeGreaterThanOrEqual(0.7);
    expect(interaction.disabledOpacity).toBeGreaterThanOrEqual(0.6);
    expect(interaction.loadingOpacity).toBeGreaterThanOrEqual(0.7);
  });
});
