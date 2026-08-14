// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = [
  'src/components/shift-sky-animation.tsx',
  'src/features/today/today-hero.tsx',
]
  .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
  .join('\n');

describe('오늘 히어로 회색조 계약', () => {
  it('배경과 장식에 유채색 RGB 값을 사용하지 않아요', () => {
    const hexColors = source.match(/#[0-9a-f]{6}/gi) ?? [];
    const rgbaColors = source.match(/rgba\([^)]*\)/gi) ?? [];

    for (const color of hexColors) {
      const channels = [1, 3, 5].map((offset) =>
        Number.parseInt(color.slice(offset, offset + 2), 16),
      );
      expect(Math.max(...channels) - Math.min(...channels), color).toBe(0);
    }
    for (const color of rgbaColors) {
      const channels = color.match(/\d+(?:\.\d+)?/g) ?? [];
      expect(channels[1], color).toBe(channels[0]);
      expect(channels[2], color).toBe(channels[0]);
    }
  });
});
