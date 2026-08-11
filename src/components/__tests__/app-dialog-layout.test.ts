// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dialog = readFileSync(
  resolve(process.cwd(), 'src/components/app-dialog.tsx'),
  'utf8',
);

describe('앱 팝업 작은 화면 계약', () => {
  it('모든 동작을 본문과 함께 스크롤해 작은 화면에서도 누를 수 있어요', () => {
    const scrollStart = dialog.indexOf('<ScrollView');
    const scrollEnd = dialog.indexOf('</ScrollView>', scrollStart);
    const actions = dialog.indexOf('buttons.map((button, index)', scrollStart);

    expect(scrollStart).toBeGreaterThan(-1);
    expect(actions).toBeGreaterThan(scrollStart);
    expect(scrollEnd).toBeGreaterThan(actions);
    expect(dialog).toContain('buttons.length > 2');
    expect(dialog).toContain('fontScale >= 1.25');
    expect(dialog).toContain('width < 360');
  });
});
