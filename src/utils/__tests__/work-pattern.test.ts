import { describe, expect, it } from 'vitest';

import { createDefaultAppData, resolveShiftFromAppData } from '../../services/app-data-service';

import {
  createWorkPatternFromReference,
  getPositionAfterReferenceDateChange,
  getWeekdayPatternPosition,
  getWorkPatternKind,
  getWorkPatternName,
  ROTATION_PATTERN_NAME,
  ROTATION_PATTERN_SHIFT_TYPE_IDS,
  WEEKDAY_PATTERN_NAME,
  WEEKDAY_PATTERN_SHIFT_TYPE_IDS,
} from '../work-pattern';

describe('근무 방식 판별', () => {
  it('지원하는 두 근무 순서를 정확히 판별합니다', () => {
    expect(getWorkPatternKind([...ROTATION_PATTERN_SHIFT_TYPE_IDS])).toBe('rotation');
    expect(getWorkPatternKind([...WEEKDAY_PATTERN_SHIFT_TYPE_IDS])).toBe('weekday');
  });

  it('길이나 순서가 다른 근무 순서를 허용하지 않습니다', () => {
    expect(getWorkPatternKind(ROTATION_PATTERN_SHIFT_TYPE_IDS.slice(0, -1))).toBeNull();
    expect(getWorkPatternKind([...ROTATION_PATTERN_SHIFT_TYPE_IDS, 'off'])).toBeNull();
    expect(getWorkPatternKind(['day', 'night', 'day', 'night', 'off', 'off'])).toBeNull();
    expect(getWorkPatternKind(['day', 'day', 'day', 'day', 'off', 'day', 'off'])).toBeNull();
  });

  it('화면에 사용하는 근무 방식 이름을 반환합니다', () => {
    expect(getWorkPatternName('rotation')).toBe(ROTATION_PATTERN_NAME);
    expect(getWorkPatternName('weekday')).toBe(WEEKDAY_PATTERN_NAME);
  });
});

describe('주간 고정 요일 위치', () => {
  it.each([
    ['2026-07-06', 0],
    ['2026-07-07', 1],
    ['2026-07-08', 2],
    ['2026-07-09', 3],
    ['2026-07-10', 4],
    ['2026-07-11', 5],
    ['2026-07-12', 6],
  ])('%s를 월요일 기준 %i번 위치로 계산합니다', (dateKey, expected) => {
    expect(getWeekdayPatternPosition(dateKey)).toBe(expected);
  });
});

describe('기준 날짜로 근무표 시작점 계산', () => {
  it('3조 2교대에서 기준 날짜의 실제 순번을 앵커 날짜로 환산합니다', () => {
    const pattern = createWorkPatternFromReference({
      kind: 'rotation',
      referenceDate: '2026-07-14',
      position: 2,
    });
    expect(pattern).toEqual({
      name: ROTATION_PATTERN_NAME,
      anchorDate: '2026-07-12',
      scheduleStartDate: '2026-07-14',
      shiftTypeIds: [...ROTATION_PATTERN_SHIFT_TYPE_IDS],
    });

    const data = { ...createDefaultAppData('2026-07-14'), pattern };
    expect(resolveShiftFromAppData(data, '2026-07-13')).toBeNull();
    expect(
      ['2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18'].map(
        (dateKey) => resolveShiftFromAppData(data, dateKey)?.id,
      ),
    ).toEqual(['night', 'night', 'off', 'off', 'day']);
  });

  it('순번 기준일과 첫 근무일을 분리해 과거 일정 시작점을 보존합니다', () => {
    const pattern = createWorkPatternFromReference({
      kind: 'rotation',
      referenceDate: '2026-07-14',
      scheduleStartDate: '2026-06-01',
      position: 2,
    });

    expect(pattern.anchorDate).toBe('2026-07-12');
    expect(pattern.scheduleStartDate).toBe('2026-06-01');

    const data = { ...createDefaultAppData('2026-07-14'), pattern };
    expect(resolveShiftFromAppData(data, '2026-06-01')).not.toBeNull();
    expect(resolveShiftFromAppData(data, '2026-05-31')).toBeNull();
  });

  it('주간 고정은 기준 날짜가 속한 주의 월요일을 시작점으로 사용합니다', () => {
    expect(
      createWorkPatternFromReference({
        kind: 'weekday',
        referenceDate: '2026-07-11',
      }),
    ).toEqual({
      name: WEEKDAY_PATTERN_NAME,
      anchorDate: '2026-07-06',
      scheduleStartDate: '2026-07-11',
      shiftTypeIds: [...WEEKDAY_PATTERN_SHIFT_TYPE_IDS],
    });
  });

  it('잘못된 날짜나 범위를 벗어난 순번을 허용하지 않습니다', () => {
    expect(() =>
      createWorkPatternFromReference({
        kind: 'rotation',
        referenceDate: '2026-02-30',
        position: 0,
      }),
    ).toThrow('기준 날짜가 올바르지 않아요.');
    expect(() =>
      createWorkPatternFromReference({
        kind: 'rotation',
        referenceDate: '2026-07-14',
        position: 6,
      }),
    ).toThrow('기준 날짜의 실제 근무를 선택해 주세요.');
    expect(() =>
      createWorkPatternFromReference({
        kind: 'rotation',
        referenceDate: '2026-07-14',
        scheduleStartDate: '2026-02-30',
        position: 0,
      }),
    ).toThrow('첫 근무일이 올바르지 않아요.');
  });
});

describe('기준 날짜 변경 시 실제 순번 재확인', () => {
  it('날짜가 달라지면 이전 날짜에서 선택한 순번을 비웁니다', () => {
    expect(
      getPositionAfterReferenceDateChange({
        currentDate: '2026-07-14',
        nextDate: '2026-07-15',
        selectedPosition: 2,
      }),
    ).toBeNull();
  });

  it('같은 날짜를 다시 선택하면 확인한 순번을 유지합니다', () => {
    expect(
      getPositionAfterReferenceDateChange({
        currentDate: '2026-07-14',
        nextDate: '2026-07-14',
        selectedPosition: 2,
      }),
    ).toBe(2);
  });
});
