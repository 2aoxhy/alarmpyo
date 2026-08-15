import { describe, expect, it } from 'vitest';

import {
  AppDataValidationError,
  dateKey,
  integerInRange,
  nullableIsoDate,
  nullableMinutes,
  record,
  requiredBoolean,
  requiredString,
} from '../validation';

describe('앱 데이터 검증 기본 규칙', () => {
  it('기존 값과 경계값을 그대로 반환해요', () => {
    const object = { value: true };

    expect(record(object, '데이터')).toBe(object);
    expect(requiredString('근무', '이름', 2)).toBe('근무');
    expect(requiredBoolean(false, '사용 여부')).toBe(false);
    expect(integerInRange(0, '숫자', 0, 10)).toBe(0);
    expect(integerInRange(10, '숫자', 0, 10)).toBe(10);
    expect(nullableMinutes(null, '시간')).toBeNull();
    expect(nullableMinutes(1_439, '시간')).toBe(1_439);
    expect(dateKey('2026-08-09', '기준일')).toBe('2026-08-09');
    expect(nullableIsoDate('2026-08-09T00:00:00.000Z', '생성일')).toBe(
      '2026-08-09T00:00:00.000Z',
    );
  });

  it('기존 오류 종류와 문구를 유지해요', () => {
    expect(() => record([], '근무표 데이터')).toThrow(
      '근무표 데이터 형식이 올바르지 않습니다.',
    );
    expect(() => requiredString(' ', '이름')).toThrow('이름 값이 올바르지 않습니다.');
    expect(() => requiredBoolean(1, '사용 여부')).toThrow(
      '사용 여부 값이 올바르지 않습니다.',
    );
    expect(() => integerInRange(11, '숫자', 0, 10)).toThrow(
      '숫자 값이 올바르지 않습니다.',
    );
    expect(() => nullableMinutes(1_440, '시간')).toThrow(
      '시간 값이 올바르지 않습니다.',
    );
    expect(() => dateKey('2026-02-30', '기준일')).toThrow(
      '기준일 날짜가 올바르지 않습니다.',
    );
    expect(() => nullableIsoDate('깨진 날짜', '생성일')).toThrow(
      '생성일 날짜가 올바르지 않습니다.',
    );

    try {
      record(null, '데이터');
    } catch (error) {
      expect(error).toBeInstanceOf(AppDataValidationError);
      expect((error as Error).name).toBe('AppDataValidationError');
    }
  });
});
