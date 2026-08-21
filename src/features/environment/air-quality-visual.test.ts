// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveAirQualityVisual } from './air-quality-visual-model';

describe('공기질 시각 체계', () => {
  it('등급마다 색상과 무관하게 구분되는 실루엣을 사용해요', () => {
    expect(resolveAirQualityVisual('good')).toEqual({
      icon: 'clear-face',
      tone: 'info',
    });
    expect(resolveAirQualityVisual('moderate')).toEqual({
      icon: 'particle-face',
      tone: 'success',
    });
    expect(resolveAirQualityVisual('bad')).toEqual({
      icon: 'kf-mask',
      tone: 'warning',
    });
    expect(resolveAirQualityVisual('very-bad')).toEqual({
      icon: 'respirator',
      tone: 'danger',
    });
    expect(resolveAirQualityVisual('unknown')).toEqual({
      icon: 'unknown',
      tone: 'neutral',
    });
  });

  it('SVG는 장식으로 숨겨 상위 브리핑 문장과 중복 낭독하지 않아요', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/environment/air-quality-visual.tsx'),
      'utf8',
    );

    expect(source).toContain('accessible={false}');
    expect(source).toContain('aria-hidden');
    expect(source).not.toContain('accessibilityLabel=');
  });
});
