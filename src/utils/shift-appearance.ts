import type { AppPalette } from '../constants/app-theme';
import type { ShiftType } from '../models/app-data';
import {
  resolveShiftVisualRole,
  resolveShiftVisualSpec,
} from '../design-system/shift-visual-theme';

export type ShiftAppearance = {
  accentColor: string;
  softColor: string;
  meaningColor?: string;
};

export type ShiftCategory =
  | 'day'
  | 'evening'
  | 'night'
  | 'off'
  | 'special-work'
  | 'custom';

export function getShiftCategory(
  shift: Pick<ShiftType, 'id' | 'isOff'>,
): ShiftCategory {
  if (shift.isOff || shift.id === 'off') return 'off';
  if (shift.id === 'day') return 'day';
  if (shift.id === 'evening') return 'evening';
  if (shift.id === 'night') return 'night';
  if (shift.id.startsWith('substitute-')) return 'special-work';
  return 'custom';
}

/** 알려진 근무는 테마의 의미색을 사용해 작은 글자와 아이콘의 대비를 일정하게 유지해요. */
export function getShiftAppearance(
  shift: Pick<ShiftType, 'color' | 'id' | 'isOff' | 'softColor'>,
  palette: AppPalette,
  isDark: boolean,
): ShiftAppearance {
  if (isDark) {
    const role = resolveShiftVisualRole(shift);
    const spec = resolveShiftVisualSpec(role, shift.color);
    return {
      accentColor:
        role === 'substitute-day'
          ? '#58D9BC'
          : role === 'substitute-night'
            ? '#89CEFF'
            : spec.accent,
      softColor: spec.softBackground,
      ...(spec.meaningRail ? { meaningColor: spec.meaningRail } : {}),
    };
  }
  if (shift.isOff || shift.id === 'off') {
    return { accentColor: palette.inkMuted, softColor: palette.surfaceSoft };
  }
  if (shift.id === 'day') {
    return { accentColor: palette.mintDark, softColor: palette.mintSoft };
  }
  if (shift.id === 'evening') {
    return { accentColor: palette.amber, softColor: palette.amberSoft };
  }
  if (shift.id === 'night') {
    return { accentColor: palette.blue, softColor: palette.blueSoft };
  }
  if (shift.id === 'substitute-day') {
    return {
      accentColor: palette.mintDark,
      softColor: palette.mintSoft,
      meaningColor: palette.amber,
    };
  }
  if (shift.id === 'substitute-night') {
    return {
      accentColor: palette.blue,
      softColor: palette.blueSoft,
      meaningColor: palette.amber,
    };
  }
  return { accentColor: shift.color, softColor: shift.softColor };
}
