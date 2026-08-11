import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../app-data-service';
import { applyBulkDayChange } from '../bulk-day-update';

describe('선택 날짜 일괄 변경', () => {
  const dates = ['2026-07-13', '2026-07-14'];

  it('근무를 일괄 적용하며 시간 변경과 예외 일정을 정리해요', () => {
    const data = createDefaultAppData('2026-07-11');
    data.timeOverrides['2026-07-13'] = {
      shiftTypeId: 'day',
      startMinutes: 360,
      endMinutes: 1080,
      endsNextDay: false,
    };
    data.dayExceptions['2026-07-14'] = 'training';

    const result = applyBulkDayChange(data, dates, {
      kind: 'shift',
      shiftTypeId: 'night',
    });

    expect(result?.overrides).toMatchObject({
      '2026-07-13': 'night',
      '2026-07-14': 'night',
    });
    expect(result?.timeOverrides).toEqual({});
    expect(result?.dayExceptions).toEqual({});
  });

  it('예외 일정은 기존 근무와 날짜별 시간을 보존해요', () => {
    const data = createDefaultAppData('2026-07-11');
    data.overrides['2026-07-13'] = 'night';
    data.timeOverrides['2026-07-13'] = {
      shiftTypeId: 'night',
      startMinutes: 1140,
      endMinutes: 420,
      endsNextDay: true,
    };

    const result = applyBulkDayChange(data, dates, {
      kind: 'exception',
      dayException: 'reserve',
    });

    expect(result?.overrides['2026-07-13']).toBe('night');
    expect(result?.timeOverrides['2026-07-13']).toEqual(
      data.timeOverrides['2026-07-13'],
    );
    expect(result?.dayExceptions).toEqual({
      '2026-07-13': 'reserve',
      '2026-07-14': 'reserve',
    });
  });

  it('예외 일정만 해제하고 근무와 날짜별 시간은 유지해요', () => {
    const data = createDefaultAppData('2026-07-11');
    data.overrides['2026-07-13'] = 'night';
    data.timeOverrides['2026-07-13'] = {
      shiftTypeId: 'night',
      startMinutes: 1140,
      endMinutes: 420,
      endsNextDay: true,
    };
    data.dayExceptions['2026-07-13'] = 'training';

    const result = applyBulkDayChange(data, ['2026-07-13'], {
      kind: 'exception',
      dayException: null,
    });

    expect(result?.overrides['2026-07-13']).toBe('night');
    expect(result?.timeOverrides['2026-07-13']).toEqual(
      data.timeOverrides['2026-07-13'],
    );
    expect(result?.dayExceptions).toEqual({});
  });

  it('기본 근무표로 되돌리며 개인 메모는 유지해요', () => {
    const data = createDefaultAppData('2026-07-11');
    data.overrides['2026-07-13'] = 'night';
    data.timeOverrides['2026-07-13'] = {
      shiftTypeId: 'night',
      startMinutes: 1140,
      endMinutes: 420,
      endsNextDay: true,
    };
    data.dayExceptions['2026-07-13'] = 'training';
    data.notes['2026-07-13'] = '준비물';

    const result = applyBulkDayChange(data, ['2026-07-13'], {
      kind: 'pattern',
    });

    expect(result?.overrides).toEqual({});
    expect(result?.timeOverrides).toEqual({});
    expect(result?.dayExceptions).toEqual({});
    expect(result?.notes['2026-07-13']).toBe('준비물');
  });

  it('중복 날짜를 한 번만 처리하고 원본을 변경하지 않아요', () => {
    const data = createDefaultAppData('2026-07-11');
    const result = applyBulkDayChange(
      data,
      ['2026-07-13', '2026-07-13'],
      { kind: 'shift', shiftTypeId: 'off' },
    );

    expect(result?.overrides).toEqual({ '2026-07-13': 'off' });
    expect(data.overrides).toEqual({});
  });

  it('잘못된 날짜나 없는 근무가 섞이면 전부 적용하지 않아요', () => {
    const data = createDefaultAppData('2026-07-11');

    expect(
      applyBulkDayChange(data, ['2026-07-10', '2026-07-13'], {
        kind: 'shift',
        shiftTypeId: 'day',
      }),
    ).toBeNull();
    expect(
      applyBulkDayChange(data, dates, {
        kind: 'shift',
        shiftTypeId: 'unknown',
      }),
    ).toBeNull();
    expect(data.overrides).toEqual({});
  });
});
