import type { ShiftType } from '@/models/app-data';

export type ShiftVisualRole =
  | 'day'
  | 'evening'
  | 'night'
  | 'off'
  | 'substitute-day'
  | 'substitute-night'
  | 'special'
  | 'custom';

export type ShiftHeroTheme = {
  gradient: readonly [string, string];
  accent: string;
  artwork: 'sun' | 'moon' | 'neutral';
  foreground: '#FFFFFF';
};

const WHITE = '#FFFFFF' as const;
const CUSTOM_ACCENT_FALLBACK = '#C8CED6';

const SHIFT_HERO_THEMES: Record<
  Exclude<ShiftVisualRole, 'custom'>,
  ShiftHeroTheme
> = {
  day: {
    gradient: ['#0E4B43', '#163A35'],
    accent: '#58D9BC',
    artwork: 'sun',
    foreground: WHITE,
  },
  evening: {
    gradient: ['#4A3518', '#2E2519'],
    accent: '#F0C36A',
    artwork: 'sun',
    foreground: WHITE,
  },
  night: {
    gradient: ['#112B46', '#171F33'],
    accent: '#89CEFF',
    artwork: 'moon',
    foreground: WHITE,
  },
  off: {
    gradient: ['#2A2F35', '#181B1F'],
    accent: '#B5BDC8',
    artwork: 'neutral',
    foreground: WHITE,
  },
  'substitute-day': {
    gradient: ['#0E4B43', '#163A35'],
    accent: '#F0C36A',
    artwork: 'sun',
    foreground: WHITE,
  },
  'substitute-night': {
    gradient: ['#112B46', '#171F33'],
    accent: '#F0C36A',
    artwork: 'moon',
    foreground: WHITE,
  },
  special: {
    gradient: ['#3A2B14', '#241D16'],
    accent: '#F0C36A',
    artwork: 'neutral',
    foreground: WHITE,
  },
};

function isSixDigitHex(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const brighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (brighter + 0.05) / (darker + 0.05);
}

function resolveCustomAccent(customAccent?: string | null) {
  if (!isSixDigitHex(customAccent)) return CUSTOM_ACCENT_FALLBACK;
  const normalized = customAccent.trim().toUpperCase();
  const visibleOnCustomBackground = ['#2A2F35', '#181B1F'].every(
    (background) => contrastRatio(normalized, background) >= 3,
  );
  return visibleOnCustomBackground ? normalized : CUSTOM_ACCENT_FALLBACK;
}

/** 저장 데이터는 건드리지 않고 실제 적용 근무를 화면 의미 역할로만 변환합니다. */
export function resolveShiftVisualRole(
  shift: Pick<ShiftType, 'id' | 'isOff'> | null | undefined,
  specialSchedule = false,
): ShiftVisualRole {
  if (specialSchedule) return 'special';
  if (!shift || shift.isOff) return 'off';
  if (shift.id === 'day') return 'day';
  if (shift.id === 'evening') return 'evening';
  if (shift.id === 'night') return 'night';
  if (shift.id === 'substitute-day') return 'substitute-day';
  if (shift.id === 'substitute-night') return 'substitute-night';
  return 'custom';
}

/** Today·네이티브 알람·위젯이 공유할 수 있는 근무 의미색 계약입니다. */
export function resolveShiftHeroTheme(
  role: ShiftVisualRole,
  customAccent?: string | null,
): ShiftHeroTheme {
  if (role !== 'custom') return SHIFT_HERO_THEMES[role];

  return {
    gradient: ['#2A2F35', '#181B1F'],
    accent: resolveCustomAccent(customAccent),
    artwork: 'neutral',
    foreground: WHITE,
  };
}
