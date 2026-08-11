// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const segmentedControl = readFileSync(
  resolve(process.cwd(), 'src/design-system/segmented-control.tsx'),
  'utf8',
);

describe('분할 선택 접근성 계약', () => {
  it('TalkBack에 단일 선택 그룹과 선택 상태를 라디오 의미로 전달해요', () => {
    expect(segmentedControl).toContain('accessibilityRole="radiogroup"');
    expect(segmentedControl).toContain('accessibilityRole="radio"');
    expect(segmentedControl).toContain('accessibilityState={{ checked: selected');
    expect(segmentedControl).not.toContain('accessibilityRole="tab"');
  });
});
