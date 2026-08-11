import type { AppPalette } from '../constants/app-theme';
import type { ShiftType } from '../models/app-data';

export type ShiftAppearance = {
  accentColor: string;
  softColor: string;
};

/** 알려진 근무는 테마의 의미색을 사용해 작은 글자와 아이콘의 대비를 일정하게 유지해요. */
export function getShiftAppearance(
  shift: Pick<ShiftType, 'color' | 'id' | 'isOff' | 'softColor'>,
  palette: AppPalette,
  _isDark: boolean,
): ShiftAppearance {
  if (shift.isOff || shift.id === 'off') {
    return { accentColor: palette.inkMuted, softColor: palette.surfaceSoft };
  }
  if (shift.id === 'day') {
    return { accentColor: palette.mintDark, softColor: palette.mintSoft };
  }
  if (shift.id === 'night') {
    return { accentColor: palette.violet, softColor: palette.violetSoft };
  }
  if (shift.id.startsWith('substitute-')) {
    return { accentColor: palette.amber, softColor: palette.amberSoft };
  }
  return { accentColor: shift.color, softColor: shift.softColor };
}
