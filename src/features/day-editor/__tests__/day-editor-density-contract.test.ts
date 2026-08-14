// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dayEditor = readFileSync(
  resolve(process.cwd(), 'src/app/day/[date].tsx'),
  'utf8',
);

describe('하루 일정 요약 우선 계약', () => {
  it('추가 설정을 네 개의 명확한 항목으로 나누고 한 항목만 열어요', () => {
    for (const title of ['특별 일정', '근무 시간', '근무 알람', '메모']) {
      expect(dayEditor).toContain(`title="${title}"`);
    }
    expect(dayEditor).toContain(
      "type AdditionalPanel = 'exception' | 'time' | 'alarm' | 'note';",
    );
    expect(dayEditor).toContain(
      'setAdditionalPanel((current) => (current === panel ? null : panel))',
    );
  });

  it('저장 오류가 난 정확한 편집 항목을 열어요', () => {
    expect(dayEditor).toContain("setAdditionalPanel('time')");
    expect(dayEditor).toContain("setAdditionalPanel('alarm')");
  });
});
