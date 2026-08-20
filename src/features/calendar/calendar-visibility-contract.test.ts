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
const weekList = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-week-list.tsx'),
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

  it('공휴일과 급여일을 근무 배지와 분리한 16dp 표식으로 표시합니다', () => {
    expect(dayCell).toContain('statusDisplay.markers');
    expect(dayCell).toContain('styles.calendarMetadataMarker');
    expect(dayCell).toContain('styles.holidayMetadataMarker');
    expect(dayCell).toContain('styles.paydayMetadataMarker');
    expect(dayCell).toContain('width: 16');
    expect(dayCell).toContain('height: 16');
    expect(dayCell).toContain('accessibilityElementsHidden');
    expect(dayCell).toContain('importantForAccessibility="no-hide-descendants"');
    expect(dayCell).not.toContain('statusDisplay.primary');
    expect(dayCell).not.toContain('showPaydayDot');
    expect(dayCell).not.toContain('styles.paydayDot');
    expect(supportSections).toContain('급여일 · 급* 예상 급여일');
    expect(supportSections).toContain('급은 급여일, 급 별표는 예상 급여일');
  });

  it('표식 행은 기존 상태 영역보다 높아지지 않습니다', () => {
    expect(dayCell).toContain('minHeight: 22');
    expect(dayCell).toContain('calendarMetadataRowCompact: { minHeight: 20 }');
  });

  it('범례는 공휴일과 급여일 표식을 모양과 한 번의 접근성 문장으로 설명해요', () => {
    expect(supportSections).toContain(
      'accessibilityLabel="공. 공휴일을 표시합니다."',
    );
    expect(supportSections).toContain('styles.holidayLegendMarker');
    expect(supportSections).toContain('styles.paydayLegendMarkers');
    expect(supportSections).toContain("maxWidth: '100%'");
    expect(supportSections).toContain('flexShrink: 0');
    expect(supportSections).toContain(
      'legendCopy: { minWidth: 0, flex: 1, flexShrink: 1 }',
    );
    expect(
      supportSections.match(
        /importantForAccessibility="no-hide-descendants"/g,
      ),
    ).toHaveLength(2);
  });

  it('비활성 날짜는 컨테이너 투명도로 글자까지 흐리지 않아요', () => {
    expect(dayCell).toContain(
      'inactiveCell: { backgroundColor: palette.surfaceSoft }',
    );
    expect(dayCell).toContain('? palette.disabledInk');
    expect(dayCell).not.toContain('inactiveCell: { opacity:');
  });

  it('좁은 화면과 큰 글자에서는 가로 스크롤 없이 주차 목록을 표시합니다', () => {
    expect(monthCard).toContain("calendarLayout.presentation === 'month-grid'");
    expect(monthCard).toContain('<CalendarWeekList');
    expect(monthCard).not.toContain('ScrollView');
    expect(monthCard).not.toContain('horizontalEdgeCueLeft');
    expect(monthCard).not.toContain('horizontalEdgeCueRight');
    expect(monthCard).not.toContain('가려진 토요일');
    expect(weekList).toContain('minHeight: 48');
    expect(weekList).not.toContain('numberOfLines');
  });

  it('선택 범위와 선택 패널은 배경 대비 3대 1 이상의 강한 경계를 사용해요', () => {
    expect(dayCell).toContain('borderColor: palette.selectionBorder');
    expect(dayCell).toContain('styles.selectedCheck');
    expect(dayCell).toContain('styles.dayIndicatorRow');
    expect(dayCell).toContain('width: 16');
    expect(dayCell).not.toContain("selectedCheck: {\n      position: 'absolute'");
    expect(dayCell).toContain('outlineColor: palette.focus');
  });
});
