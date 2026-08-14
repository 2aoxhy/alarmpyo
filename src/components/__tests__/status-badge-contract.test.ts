// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/status-badge.tsx'),
  'utf8',
);

describe('공통 상태 배지 계약', () => {
  it('달력 배지는 한글을 읽을 수 있는 최소 크기와 한 줄 정책을 유지해요', () => {
    expect(source).toContain('minHeight: 22');
    expect(source).toContain('fontSize: 12');
    expect(source).toContain('numberOfLines={1}');
  });

  it('의미색과 별개로 밝은 기본 글자색을 사용해요', () => {
    expect(source).toContain('foregroundColor ?? palette.white');
    expect(source).toContain('backgroundColor,');
  });
});
