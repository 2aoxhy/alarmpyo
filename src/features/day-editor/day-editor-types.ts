export type DaySelection = string | null | 'pattern';

export type SubstituteMode = 'day' | 'night';

export const SUBSTITUTE_DAY_ID = 'substitute-day';
export const SUBSTITUTE_NIGHT_ID = 'substitute-night';

export function isSubstituteShiftId(id: string): boolean {
  return id === SUBSTITUTE_DAY_ID || id === SUBSTITUTE_NIGHT_ID;
}
