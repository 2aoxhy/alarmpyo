import { describe, expect, it } from 'vitest';

import { resolveCalendarLayout } from '../calendar-layout';

describe('달력 반응형 배치', () => {
  it('화면이 넓어질 때 날짜 칸이 갑자기 좁아지지 않아요', () => {
    const widths = [320, 340, 359, 360, 379, 380, 412, 480, 720];
    const cells = widths.map((width) => resolveCalendarLayout(width, 1).cellWidth);

    cells.slice(1).forEach((cellWidth, index) => {
      expect(cellWidth).toBeGreaterThanOrEqual(cells[index]);
    });
  });

  it('320dp 화면에서도 날짜마다 겹치지 않는 48dp 터치 폭을 확보해요', () => {
    const narrow = resolveCalendarLayout(320, 1);

    expect(narrow.cellWidth).toBeGreaterThanOrEqual(48);
    expect(narrow.gridWidth).toBeGreaterThanOrEqual(48 * 7);
    expect(narrow.needsHorizontalScroll).toBe(true);
    expect(resolveCalendarLayout(360, 1).cellWidth).toBeGreaterThan(49);
    expect(resolveCalendarLayout(360, 1).needsHorizontalScroll).toBe(false);
  });

  it('큰 글씨에서는 셀과 월 머리글 높이를 함께 늘려요', () => {
    const normal = resolveCalendarLayout(360, 1);
    const large = resolveCalendarLayout(360, 1.5);

    expect(large.cellMinHeight).toBeGreaterThan(normal.cellMinHeight);
    expect(large.monthHeaderMinHeight).toBeGreaterThan(normal.monthHeaderMinHeight);
    expect(large.dayBadgeSize).toBeGreaterThan(normal.dayBadgeSize);
  });

  it('6주인 달은 셀을 조금 더 촘촘하게 표시해요', () => {
    const fourRows = resolveCalendarLayout(360, 1, 4);
    const fiveRows = resolveCalendarLayout(360, 1, 5);
    const sixRows = resolveCalendarLayout(360, 1, 6);

    expect(sixRows.cellMinHeight).toBeLessThan(fiveRows.cellMinHeight);
    expect(fiveRows.cellMinHeight).toBeLessThan(fourRows.cellMinHeight);
  });

  it('큰 글씨의 6주 달력도 읽을 수 있는 높이를 확보하면서 지나치게 길어지지 않아요', () => {
    const layout = resolveCalendarLayout(360, 2, 6);

    expect(layout.cellMinHeight * 6).toBeGreaterThan(500);
    expect(layout.cellMinHeight * 6).toBeLessThanOrEqual(600);
  });

  it('일반 휴대폰 폭에서는 셀 문구를 짧게 표시해요', () => {
    [320, 360, 412].forEach((width) => {
      expect(resolveCalendarLayout(width, 1).badgeUsesCompactLabel).toBe(true);
    });
    expect(resolveCalendarLayout(520, 1).badgeUsesCompactLabel).toBe(false);
  });

  it('큰 글씨에서는 넓은 화면도 실제 사용 가능한 셀 폭을 기준으로 줄여요', () => {
    expect(resolveCalendarLayout(520, 1.5).badgeUsesCompactLabel).toBe(true);
    expect(resolveCalendarLayout(720, 1).badgeUsesCompactLabel).toBe(false);
  });
});
