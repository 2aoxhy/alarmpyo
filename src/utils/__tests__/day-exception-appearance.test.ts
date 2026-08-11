import { describe, expect, it } from 'vitest';

import { darkPalette, lightPalette } from '../../constants/app-theme';
import {
  getDayExceptionAppearance,
  getDayExceptionBadgeLabel,
} from '../day-exception-appearance';

describe('getDayExceptionAppearance', () => {
  it('교육은 야간과 구분되는 파란색과 책 아이콘을 사용합니다', () => {
    expect(getDayExceptionAppearance('training', lightPalette)).toEqual({
      accentColor: lightPalette.blue,
      iconName: 'book-outline',
      label: '교육',
      softColor: lightPalette.blueSoft,
    });
    expect(lightPalette.blue).not.toBe(lightPalette.violet);
    expect(darkPalette.blue).not.toBe(darkPalette.violet);
  });

  it('연차는 기존 휴무 아이콘과 산호색을 유지합니다', () => {
    expect(getDayExceptionAppearance('leave', darkPalette)).toEqual({
      accentColor: darkPalette.coral,
      iconName: 'shift-off',
      label: '연차',
      softColor: darkPalette.coralSoft,
    });
  });

  it('예비군은 교육과 구분되는 올리브색 방패 아이콘을 사용합니다', () => {
    expect(getDayExceptionAppearance('reserve', lightPalette)).toEqual({
      accentColor: lightPalette.olive,
      iconName: 'shield-outline',
      label: '예비군',
      softColor: lightPalette.oliveSoft,
    });
    expect(lightPalette.olive).not.toBe(lightPalette.blue);
    expect(darkPalette.olive).not.toBe(darkPalette.blue);
  });

  it('좁은 달력에서는 교육을 한 글자로 자르지 않고 아이콘만 사용합니다', () => {
    expect(getDayExceptionBadgeLabel('training', true)).toBe('교');
    expect(getDayExceptionBadgeLabel('training', false)).toBe('교육');
    expect(getDayExceptionBadgeLabel('reserve', true)).toBe('예');
    expect(getDayExceptionBadgeLabel('reserve', false)).toBe('예비군');
  });
});
