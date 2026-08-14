// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dayCell = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-day-cell.tsx'),
  'utf8',
);
const monthCard = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-month-card.tsx'),
  'utf8',
);
const supportSections = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-support-sections.tsx'),
  'utf8',
);

describe('달력 가시성 계약', () => {
  it('토요일은 중립 회색이 아닌 별도 의미색을 사용해요', () => {
    expect(dayCell).toContain('weekdayIndex === 6');
    expect(dayCell).toContain('? palette.weekendSaturday');
    expect(monthCard).toContain('index === 6 ? palette.weekendSaturday');
  });

  it('급여 중복은 색 점이 아닌 급여 글리프로 표시해요', () => {
    expect(dayCell).toContain('statusDisplay.paydayMarkerLabel');
    expect(dayCell).not.toContain('showPaydayDot');
    expect(dayCell).not.toContain('styles.paydayDot');
    expect(supportSections).toContain('회사 기준 급여일');
    expect(supportSections).toContain('* 예상일');
  });

  it('비활성 날짜는 컨테이너 투명도로 글자까지 흐리지 않아요', () => {
    expect(dayCell).toContain(
      'inactiveCell: { backgroundColor: palette.surfaceSoft }',
    );
    expect(dayCell).toContain('? palette.disabledInk');
    expect(dayCell).not.toContain('inactiveCell: { opacity:');
  });

  it('좁은 화면의 가로 달력은 양쪽 가장자리 단서와 접근성 힌트를 제공해요', () => {
    expect(monthCard).toContain('horizontalEdgeCueLeft');
    expect(monthCard).toContain('horizontalEdgeCueRight');
    expect(monthCard).toContain('좌우로 밀어 가려진 토요일까지 확인해요.');
  });

  it('선택 범위와 선택 패널은 배경 대비 3대 1 이상의 강한 경계를 사용해요', () => {
    expect(dayCell).toContain('borderColor: palette.controlLine');
  });
});
