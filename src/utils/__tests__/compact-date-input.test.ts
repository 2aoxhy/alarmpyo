import { describe, expect, it } from 'vitest';

import {
  createCompactDateInputUpdate,
  formatCompactDateInputChange,
  normalizeCompactDateInput,
} from '../compact-date-input';

describe('짧은 날짜 입력', () => {
  it('4·6·8자리 날짜를 같은 날짜 키로 정규화해요', () => {
    expect(normalizeCompactDateInput('2682')).toEqual({
      valid: true,
      dateKey: '2026-08-02',
    });
    expect(normalizeCompactDateInput('260802')).toEqual({
      valid: true,
      dateKey: '2026-08-02',
    });
    expect(normalizeCompactDateInput('20260802')).toEqual({
      valid: true,
      dateKey: '2026-08-02',
    });
    expect(normalizeCompactDateInput('2026-08-02')).toEqual({
      valid: true,
      dateKey: '2026-08-02',
    });
  });

  it('5·7자리와 실제로 없는 날짜를 구분해 거절해요', () => {
    expect(normalizeCompactDateInput('26820')).toMatchObject({
      valid: false,
      error: '날짜는 숫자 4·6·8자리로 입력합니다.',
    });
    expect(normalizeCompactDateInput('2026820')).toMatchObject({ valid: false });
    expect(normalizeCompactDateInput('260230')).toEqual({
      valid: false,
      input: '260230',
      error: '존재하지 않는 날짜입니다.',
    });
    expect(normalizeCompactDateInput('2026-02-29')).toEqual({
      valid: false,
      input: '2026-02-29',
      error: '존재하지 않는 날짜입니다.',
    });
  });

  it('6·8자리는 입력 중 즉시 바꾸고 4자리는 입력 완료까지 기다려요', () => {
    expect(formatCompactDateInputChange('2682')).toBe('2682');
    expect(formatCompactDateInputChange('260802')).toBe('2026-08-02');
    expect(formatCompactDateInputChange('20260802')).toBe('2026-08-02');
    expect(formatCompactDateInputChange('26023')).toBe('26023');
  });

  it('8자리 연도를 입력하는 중간 6자리는 먼저 2자리 연도로 확정하지 않아요', () => {
    expect(formatCompactDateInputChange('200101')).toBe('200101');
    expect(formatCompactDateInputChange('20010101')).toBe('2001-01-01');
    expect(formatCompactDateInputChange('202608')).toBe('202608');
    expect(formatCompactDateInputChange('20260802')).toBe('2026-08-02');
  });

  it('입력 중 partial·invalid 값은 로컬에 두고 유효한 날짜만 확정해요', () => {
    expect(createCompactDateInputUpdate('26')).toEqual({
      input: '26',
      dateKey: null,
    });
    expect(createCompactDateInputUpdate('2682')).toEqual({
      input: '2682',
      dateKey: null,
    });
    expect(createCompactDateInputUpdate('2682', { finalize: true })).toEqual({
      input: '2026-08-02',
      dateKey: '2026-08-02',
    });
    expect(createCompactDateInputUpdate('260230')).toEqual({
      input: '260230',
      dateKey: null,
    });
    expect(createCompactDateInputUpdate('260802')).toEqual({
      input: '2026-08-02',
      dateKey: '2026-08-02',
    });
    expect(createCompactDateInputUpdate('202608')).toEqual({
      input: '202608',
      dateKey: null,
    });
    expect(createCompactDateInputUpdate('20260802')).toEqual({
      input: '2026-08-02',
      dateKey: '2026-08-02',
    });
  });
});
