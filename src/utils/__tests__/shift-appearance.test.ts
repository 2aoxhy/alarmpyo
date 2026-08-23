import { describe, expect, it } from 'vitest';

import { darkPalette, lightPalette } from '../../constants/app-theme';
import type { ShiftType } from '../../models/app-data';
import { getShiftAppearance, getShiftCategory } from '../shift-appearance';

function shift(id: string, isOff = false): ShiftType {
  return {
    id,
    name: id,
    shortName: id,
    color: '#123456',
    softColor: '#E0E0E0',
    startMinutes: isOff ? null : 420,
    endMinutes: isOff ? null : 1080,
    endsNextDay: false,
    alarmEnabled: !isOff,
    alarmMinutesBefore: 120,
    isOff,
  };
}

describe('근무 표시 색상', () => {
  it.each([
    ['day', lightPalette.mintDark, lightPalette.mintSoft],
    ['evening', lightPalette.amber, lightPalette.amberSoft],
    ['night', lightPalette.blue, lightPalette.blueSoft],
  ])('라이트 모드의 %s 근무를 선명한 의미색으로 표시해요', (id, accentColor, softColor) => {
    expect(getShiftAppearance(shift(id), lightPalette, false)).toEqual({
      accentColor,
      softColor,
    });
  });

  it('알 수 없는 근무는 저장된 색상을 유지해요', () => {
    expect(getShiftAppearance(shift('custom'), lightPalette, false)).toEqual({
      accentColor: '#123456',
      softColor: '#E0E0E0',
    });
    expect(getShiftAppearance(shift('custom'), darkPalette, true)).toEqual({
      accentColor: '#C8CED6',
      softColor: '#22262B',
      meaningColor: '#C8CED6',
    });
  });

  it.each([
    ['day', '#58D9BC', '#123D36'],
    ['evening', '#F0C36A', '#3E311A'],
    ['night', '#89CEFF', '#173650'],
  ])('다크 모드의 %s 근무를 밝은 의미색으로 표시해요', (id, accentColor, softColor) => {
    expect(getShiftAppearance(shift(id), darkPalette, true)).toEqual({
      accentColor,
      softColor,
    });
  });

  it('다크 모드의 휴무를 중립색으로 표시해요', () => {
    expect(getShiftAppearance(shift('off', true), darkPalette, true)).toEqual({
      accentColor: '#B5BDC8',
      softColor: '#22262B',
    });
  });

  it.each([
    ['substitute-day', lightPalette.mintDark, lightPalette.mintSoft, lightPalette.amber],
    ['substitute-night', lightPalette.blue, lightPalette.blueSoft, lightPalette.amber],
  ])(
    '라이트 모드의 %s 근무는 실제 근무색과 대체근무 의미선을 함께 표시해요',
    (id, accentColor, softColor, meaningColor) => {
      expect(getShiftAppearance(shift(id), lightPalette, false)).toEqual({
        accentColor,
        softColor,
        meaningColor,
      });
    },
  );

  it.each([
    ['substitute-day', '#58D9BC', '#123D36'],
    ['substitute-night', '#89CEFF', '#173650'],
  ])(
    '다크 모드의 %s 근무는 실제 근무색과 호박색 의미선을 함께 표시해요',
    (id, accentColor, softColor) => {
      expect(getShiftAppearance(shift(id), darkPalette, true)).toEqual({
        accentColor,
        softColor,
        meaningColor: '#F0C36A',
      });
    },
  );

  it('주대와 야대를 알람 상속과 접근성에 사용할 특근으로 분류합니다', () => {
    expect(getShiftCategory(shift('substitute-day'))).toBe('special-work');
    expect(getShiftCategory(shift('substitute-night'))).toBe('special-work');
    expect(getShiftCategory(shift('day'))).toBe('day');
    expect(getShiftCategory(shift('off', true))).toBe('off');
  });
});
