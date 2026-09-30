// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function componentSource(fileName: string): string {
  return readFileSync(resolve(process.cwd(), 'src/components', fileName), 'utf8');
}

describe('현장형 문구와 정보 밀도', () => {
  it('수면 화면은 핵심 시각을 먼저 보여주고 반복 안내를 숨깁니다', () => {
    const source = componentSource('sleep-timing-card.tsx');

    expect(source).toContain('수면 시간');
    expect(source).toContain('취침·기상 참고');
    expect(source).toContain("{expanded ? '일정 접기' : '전체 일정'}");
    expect(source).not.toContain('수면 참고 일정');
    expect(source).not.toContain('빠짐없이 안내합니다');
    expect(source).not.toContain('개인 상태에 맞게 조정해야 합니다');
    expect(source).not.toContain('{window.guidance}');
  });

  it('출근 루틴은 짧은 상태명과 48dp 터치 영역을 사용합니다', () => {
    const source = componentSource('work-routine-panel.tsx');

    expect(source).toContain("const headline = plan.currentStep ? '현재' : plan.title;");
    expect(source).toContain('minHeight: 48');
    expect(source).toContain('교대 완료 {formatClock(plan.handoverAt)}');
    expect(source).not.toContain('지금 할 일');
    expect(source).not.toContain('교대를 마치는 일정입니다');
  });
});
