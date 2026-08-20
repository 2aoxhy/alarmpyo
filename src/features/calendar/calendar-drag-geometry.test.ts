import { describe, expect, it } from 'vitest';

import { buildCalendarGrid } from '../../utils/date';

import { resolveCalendarDateAtPoint } from './calendar-drag-geometry';

const cells = buildCalendarGrid(2026, 6).slice(0, 35);
const cellRows = Array.from({ length: 5 }, (_, index) =>
  cells.slice(index * 7, index * 7 + 7),
);
const rowLayouts = Object.fromEntries(
  cellRows.map((_, index) => [index, { y: index * 80, height: 80 }]),
);
const selectableDateKeySet = new Set(
  cells.filter((cell) => cell.inCurrentMonth).map((cell) => cell.dateKey),
);

describe('달력 드래그 좌표 계산', () => {
  it('화면 좌표를 현재 달의 선택 가능한 날짜로 변환합니다', () => {
    expect(
      resolveCalendarDateAtPoint({
        cellRows,
        gridFrame: { x: 10, y: 20, width: 350 },
        pageX: 185,
        pageY: 60,
        rowLayouts,
        selectableDateKeySet,
      }),
    ).toBe('2026-07-01');
  });

  it('가로 스크롤로 콘텐츠 원점이 이동한 경우도 계산합니다', () => {
    expect(
      resolveCalendarDateAtPoint({
        cellRows,
        gridFrame: { x: -14, y: 20, width: 350 },
        pageX: 161,
        pageY: 60,
        rowLayouts,
        selectableDateKeySet,
      }),
    ).toBe('2026-07-01');
  });

  it('현재 달 밖 날짜와 선택 불가 날짜는 제외합니다', () => {
    const outsideMonth = resolveCalendarDateAtPoint({
      cellRows,
      gridFrame: { x: 10, y: 20, width: 350 },
      pageX: 35,
      pageY: 60,
      rowLayouts,
      selectableDateKeySet,
    });
    const disabled = resolveCalendarDateAtPoint({
      cellRows,
      gridFrame: { x: 10, y: 20, width: 350 },
      pageX: 185,
      pageY: 60,
      rowLayouts,
      selectableDateKeySet: new Set(),
    });

    expect(outsideMonth).toBeNull();
    expect(disabled).toBeNull();
  });

  it('콘텐츠와 행 경계 밖 또는 잘못된 측정값은 제외합니다', () => {
    const base = {
      cellRows,
      gridFrame: { x: 10, y: 20, width: 350 },
      rowLayouts,
      selectableDateKeySet,
    };

    expect(resolveCalendarDateAtPoint({ ...base, pageX: 360, pageY: 60 })).toBeNull();
    expect(resolveCalendarDateAtPoint({ ...base, pageX: 185, pageY: 420 })).toBeNull();
    expect(
      resolveCalendarDateAtPoint({
        ...base,
        gridFrame: { x: 10, y: 20, width: Number.NaN },
        pageX: 185,
        pageY: 60,
      }),
    ).toBeNull();
  });
});
