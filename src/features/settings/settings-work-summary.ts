import type { ShiftType } from '../../models/app-data';
import { formatCompactTime } from '../../utils/date';

const NO_BREAK_SPACE = '\u00A0';
const COMPACT_SUMMARY_MAX_WIDTH = 320;
const COMPACT_SUMMARY_MIN_FONT_SCALE = 1.3;

export function shouldUseCompactSettingsWorkSummary(
  width: number,
  fontScale: number,
): boolean {
  const safeWidth = Number.isFinite(width) ? Math.max(width, 0) : 360;
  const safeFontScale = Number.isFinite(fontScale) ? Math.max(fontScale, 0) : 1;
  return (
    safeWidth <= COMPACT_SUMMARY_MAX_WIDTH ||
    safeFontScale >= COMPACT_SUMMARY_MIN_FONT_SCALE
  );
}

/** 근무 이름과 시각이 서로 다른 줄로 갈라지지 않는 설정 요약을 만들어요. */
export function formatSettingsWorkSummary(
  patternLabel: string,
  shifts: readonly Pick<
    ShiftType,
    'isOff' | 'shortName' | 'startMinutes'
  >[],
  viewport: { width: number; fontScale: number },
): string {
  const timeTokens = shifts
    .filter((shift) => !shift.isOff && shift.startMinutes !== null)
    .map(
      (shift) =>
        `${shift.shortName.trim()}${NO_BREAK_SPACE}${formatCompactTime(shift.startMinutes)}`,
    );

  if (timeTokens.length === 0) return patternLabel;
  return shouldUseCompactSettingsWorkSummary(
    viewport.width,
    viewport.fontScale,
  )
    ? `${patternLabel} · 근무 시간 설정됨`
    : `${patternLabel} · ${timeTokens.join(' · ')}`;
}
