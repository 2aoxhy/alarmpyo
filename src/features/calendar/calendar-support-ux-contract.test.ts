// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const header = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-screen-header.tsx'),
  'utf8',
);
const selectionPanel = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-selection-panel.tsx'),
  'utf8',
);
const supportSections = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-support-sections.tsx'),
  'utf8',
);
const summarySheet = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-date-summary-sheet.tsx'),
  'utf8',
);

describe('달력 보조 경험 계약', () => {
  it('상단 동작은 짧은 이름과 48dp 터치 높이를 사용하고 큰 글자에서 다음 행으로 이동합니다', () => {
    expect(header).toContain('label="선택"');
    expect(header).toContain('label="오늘"');
    expect(header).toContain('달력');
    expect(header).toContain('const stackHeader = fontScale >= 1.4');
    expect(header).not.toContain('width < 360');
    expect(header.match(/flexWrap: 'nowrap'/g)).toHaveLength(3);
    expect(header).toMatch(/headerStacked:\s*\{[\s\S]*?flexWrap: 'wrap'/);
    expect(header).toContain('minHeight: 48');
    expect(header).toContain('{!selectionMode ? (');
    expect(header).toContain('supportsDragSelection');
    expect(header).toContain('날짜를 하나씩 눌러 여러 일정을 선택합니다.');
    expect(header).not.toContain('label="선택 취소하기"');
  });

  it('선택 패널은 전체와 현재 달 선택 수를 함께 표시하고 취소를 한 곳에 둡니다', () => {
    expect(selectionPanel).toContain('selectedInMonthCount = selectedCount');
    expect(selectionPanel).toContain(
      'formatCalendarSelectionPanelCount(',
    );
    expect(selectionPanel.match(/onPress=\{onCancel\}/g)).toHaveLength(1);
  });

  it('빠른 표시 키를 선택적으로 숨길 수 있고 전체 안내는 네 구역으로 나눕니다', () => {
    expect(supportSections).toContain('showCompactKey = true');
    expect(supportSections).toContain('if (!showCompactKey)');
    expect(supportSections).toContain(
      'accessibilityLabel="달력 표시 안내. 공은 공휴일, 급은 급여일, 점은 메모, 굵은 선은 직접 변경한 날을 표시합니다."',
    );
    expect(supportSections).toContain(
      '<CompactKeyItem kind="holiday" label="공휴일"',
    );
    expect(supportSections).toContain(
      '<CompactKeyItem kind="payday" label="급여일"',
    );
    expect(supportSections).toContain(
      '<CompactKeyItem kind="note" label="메모"',
    );
    expect(supportSections).toContain(
      '<CompactKeyItem kind="override" label="직접 변경"',
    );
    expect(supportSections).not.toContain('<CompactKeyItem kind="today"');
    expect(supportSections).not.toContain('<CompactKeyItem kind="selected"');
    ['근무', '날짜 정보', '특별 일정', '화면 상태'].forEach((title) => {
      expect(supportSections).toContain(`title="${title}"`);
    });
    expect(supportSections).toContain("fontScale >= 1.3");
  });

  it('날짜 요약은 포커스를 복원하고 전체 일정·날짜 정보·메모·수정 동작을 제공합니다', () => {
    expect(summarySheet).toContain('returnFocusRef={triggerRef}');
    expect(summarySheet).toContain('formatKoreanDate(data.dateKey, true)');
    expect(summarySheet).toContain('실제 일정');
    expect(summarySheet).toContain('기본 근무표');
    expect(summarySheet).toContain('data.holiday.names.join');
    expect(summarySheet).toContain('data.payrollEntry.accessibilityLabel');
    expect(summarySheet).toContain('{data.note}');
    expect(summarySheet).toContain('label="일정 수정"');
    expect(summarySheet).not.toContain('numberOfLines');
    expect(summarySheet).not.toContain('…');
  });
});
