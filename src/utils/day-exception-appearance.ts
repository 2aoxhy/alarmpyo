import type { AppIconName } from '../components/app-icon';
import type { AppPalette } from '../constants/app-theme';
import type { DayExceptionType } from '../models/app-data';
import { getDayExceptionLabel } from './day-exception';

export type DayExceptionAppearance = {
  accentColor: string;
  iconName: AppIconName;
  label: string;
  softColor: string;
};

/** 예외 일정의 색상과 아이콘을 화면마다 동일하게 유지해요. */
export function getDayExceptionAppearance(
  type: DayExceptionType,
  palette: AppPalette,
): DayExceptionAppearance {
  switch (type) {
    case 'leave':
      return {
        accentColor: palette.coral,
        iconName: 'shift-off',
        label: getDayExceptionLabel(type),
        softColor: palette.coralSoft,
      };
    case 'training':
      return {
        accentColor: palette.blue,
        iconName: 'book-outline',
        label: getDayExceptionLabel(type),
        softColor: palette.blueSoft,
      };
    case 'reserve':
      return {
        accentColor: palette.olive,
        iconName: 'shield-outline',
        label: getDayExceptionLabel(type),
        softColor: palette.oliveSoft,
      };
  }
}

/** 좁은 달력에서도 아이콘과 한 글자 이름을 함께 표시해요. */
export function getDayExceptionBadgeLabel(
  type: DayExceptionType,
  compact: boolean,
): string | null {
  return compact ? getDayExceptionLabel(type).slice(0, 1) : getDayExceptionLabel(type);
}
