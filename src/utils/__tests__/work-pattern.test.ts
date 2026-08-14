import { describe, expect, it } from 'vitest';

import { createDefaultAppData, resolveShiftFromAppData } from '../../services/app-data-service';

import {
  createWorkPatternFromReference,
  getPatternPositionForDate,
  getEffectiveWorkPatternPresetId,
  getWorkPatternCategoryId,
  getPositionAfterReferenceDateChange,
  getRotationPatternPositionForDate,
  getWeekdayPatternPosition,
  getWorkPatternKind,
  getWorkPatternName,
  getWorkPatternPresetId,
  isValidCustomPatternSequence,
  ROTATION_PATTERN_NAME,
  ROTATION_PATTERN_SHIFT_TYPE_IDS,
  WEEKDAY_PATTERN_NAME,
  WEEKDAY_PATTERN_SHIFT_TYPE_IDS,
  WORK_PATTERN_PRESETS,
  WORK_PATTERN_CATEGORIES,
} from '../work-pattern';

describe('근무 방식 판별', () => {
  it('대표 프리셋을 고정된 순서와 이름으로 제공합니다', () => {
    expect(WORK_PATTERN_PRESETS.map((preset) => preset.id)).toEqual([
      'weekday',
      'two-team-two-shift',
      'three-team-two-shift',
      'three-team-three-shift',
      'four-team-two-shift',
      'four-team-three-shift',
      'custom',
    ]);
    expect(WORK_PATTERN_PRESETS.find((preset) => preset.id === 'three-team-three-shift')?.shiftTypeIds)
      .toEqual(['day', 'evening', 'night']);
    expect(WORK_PATTERN_PRESETS.find((preset) => preset.id === 'four-team-three-shift')?.shiftTypeIds)
      .toEqual(['day', 'evening', 'night', 'off']);
  });

  it('첫 설정에서는 프리셋을 네 가지 근무 분류로 묶습니다', () => {
    expect(WORK_PATTERN_CATEGORIES.map((category) => category.id)).toEqual([
      'weekday',
      'two-shift',
      'three-shift',
      'custom',
    ]);
    expect(getWorkPatternCategoryId('four-team-two-shift')).toBe('two-shift');
    expect(getWorkPatternCategoryId('three-team-three-shift')).toBe('three-shift');
    expect(getWorkPatternCategoryId(null)).toBeNull();
  });

  it('기존 분기 계약에서 주간 고정과 모든 대표 반복 교대를 판별합니다', () => {
    expect(getWorkPatternKind([...ROTATION_PATTERN_SHIFT_TYPE_IDS])).toBe('rotation');
    expect(getWorkPatternKind([...WEEKDAY_PATTERN_SHIFT_TYPE_IDS])).toBe('weekday');
    expect(getWorkPatternKind(['day', 'night'])).toBe('rotation');
    expect(getWorkPatternKind(['day', 'evening', 'night'])).toBe('rotation');
    expect(getWorkPatternKind(['day', 'night', 'off', 'off'])).toBe('rotation');
  });

  it('대표 프리셋과 다른 유효한 순서는 기타로 판별합니다', () => {
    expect(getWorkPatternPresetId(ROTATION_PATTERN_SHIFT_TYPE_IDS.slice(0, -1))).toBe('custom');
    expect(getWorkPatternKind([...ROTATION_PATTERN_SHIFT_TYPE_IDS, 'off'])).toBeNull();
    expect(getWorkPatternKind(['day', 'night', 'day', 'night', 'off', 'off'])).toBeNull();
    expect(getWorkPatternKind(['day', 'day', 'day', 'day', 'off', 'day', 'off'])).toBeNull();
  });

  it('기타 순서는 1~42일, 고정 역할, 근무일 하나 이상의 계약을 지킵니다', () => {
    expect(isValidCustomPatternSequence(['day'])).toBe(true);
    expect(isValidCustomPatternSequence(Array.from({ length: 42 }, () => 'night'))).toBe(true);
    expect(isValidCustomPatternSequence(['day', 'evening', 'night', 'off'])).toBe(true);
    expect(isValidCustomPatternSequence(['off'])).toBe(false);
    expect(isValidCustomPatternSequence(Array.from({ length: 43 }, () => 'day'))).toBe(false);
    expect(isValidCustomPatternSequence(['day', 'substitute-day'])).toBe(false);
  });

  it('주간 고정과 같은 사용자 순서는 저장 mode가 없으므로 주간 고정으로 전환해요', () => {
    expect(
      getEffectiveWorkPatternPresetId('custom', WEEKDAY_PATTERN_SHIFT_TYPE_IDS),
    ).toBe('weekday');
    expect(
      getEffectiveWorkPatternPresetId('four-team-two-shift', WEEKDAY_PATTERN_SHIFT_TYPE_IDS),
    ).toBe('weekday');
    expect(getEffectiveWorkPatternPresetId('weekday', ['day', 'off'])).toBe('custom');
    expect(
      getEffectiveWorkPatternPresetId('four-team-two-shift', ['day', 'night']),
    ).toBe('two-team-two-shift');
    expect(getEffectiveWorkPatternPresetId(null, WEEKDAY_PATTERN_SHIFT_TYPE_IDS)).toBeNull();
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
  it('프리셋마다 다른 반복 길이로 기준일의 실제 순번을 옮겨요', () => {
    expect(
      getPatternPositionForDate({
        date: '2026-07-16',
        referenceDate: '2026-07-14',
        referencePosition: 2,
        sequenceLength: 4,
      }),
    ).toBe(0);
    expect(
      getPatternPositionForDate({
        date: '2026-07-13',
        referenceDate: '2026-07-14',
        referencePosition: 0,
        sequenceLength: 3,
      }),
    ).toBe(2);
  });

  it('일정 적용 시작일의 순번을 기준일과의 날짜 차이로 계산해요', () => {
    expect(
      getRotationPatternPositionForDate({
        date: '2026-06-01',
        referenceDate: '2026-07-14',
        referencePosition: 2,
      }),
    ).toBe(1);
    expect(
      getRotationPatternPositionForDate({
        date: '2026-07-16',
        referenceDate: '2026-07-14',
        referencePosition: 2,
      }),
    ).toBe(4);
  });

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

  it('3교대와 사용자 순서를 선택한 실제 위치에서 생성합니다', () => {
    expect(
      createWorkPatternFromReference({
        presetId: 'three-team-three-shift',
        referenceDate: '2026-07-14',
        position: 1,
      }),
    ).toEqual({
      name: '3조 3교대 (주오야)',
      anchorDate: '2026-07-13',
      scheduleStartDate: '2026-07-14',
      shiftTypeIds: ['day', 'evening', 'night'],
    });

    expect(
      createWorkPatternFromReference({
        presetId: 'custom',
        name: '우리 회사 순서',
        shiftTypeIds: ['day', 'off', 'evening', 'night', 'off'],
        referenceDate: '2026-07-14',
        position: 3,
      }),
    ).toMatchObject({
      name: '우리 회사 순서',
      anchorDate: '2026-07-11',
      shiftTypeIds: ['day', 'off', 'evening', 'night', 'off'],
    });
  });

  it('주간 고정과 같은 사용자 순서는 적용일의 요일로 anchor를 계산해요', () => {
    expect(
      createWorkPatternFromReference({
        presetId: 'custom',
        name: '사용자 주간 순서',
        shiftTypeIds: WEEKDAY_PATTERN_SHIFT_TYPE_IDS,
        referenceDate: '2026-07-15',
        scheduleStartDate: '2026-07-18',
        position: 2,
      }),
    ).toEqual({
      name: WEEKDAY_PATTERN_NAME,
      anchorDate: '2026-07-13',
      scheduleStartDate: '2026-07-18',
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
