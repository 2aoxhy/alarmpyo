import { describe, expect, it } from 'vitest';

import {
  shouldReflowControl,
  usesSimplifiedCalendar,
} from './responsive';

describe('공통 반응형 기준', () => {
  it('글자 배율 1.4부터 단순 달력을 사용해요', () => {
    expect(usesSimplifiedCalendar(1.39)).toBe(false);
    expect(usesSimplifiedCalendar(1.4)).toBe(true);
    expect(usesSimplifiedCalendar(2)).toBe(true);
  });

  it('320dp 화면과 큰 글자에서 행과 버튼을 다시 배치해요', () => {
    expect(shouldReflowControl(320, 1)).toBe(true);
    expect(shouldReflowControl(600, 1)).toBe(false);
    expect(shouldReflowControl(600, 1.4)).toBe(true);
  });

  it('잘못된 화면 값은 안전한 기본값으로 처리해요', () => {
    expect(shouldReflowControl(Number.NaN, Number.NaN)).toBe(false);
    expect(usesSimplifiedCalendar(Number.NaN)).toBe(false);
  });

  it.each([320, 360, 412, 600])(
    '%idp에서 글자 배율 1·1.3·1.5·2의 기준이 일관돼요',
    (width) => {
      expect(usesSimplifiedCalendar(1)).toBe(false);
      expect(usesSimplifiedCalendar(1.3)).toBe(false);
      expect(usesSimplifiedCalendar(1.5)).toBe(true);
      expect(usesSimplifiedCalendar(2)).toBe(true);
      expect(shouldReflowControl(width, 1)).toBe(width < 340);
      expect(shouldReflowControl(width, 1.3)).toBe(width < 340);
      expect(shouldReflowControl(width, 1.5)).toBe(true);
      expect(shouldReflowControl(width, 2)).toBe(true);
    },
  );
});
