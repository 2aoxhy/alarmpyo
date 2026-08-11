/** 기본 근무 시각입니다. 사용자 설정 전 초기값과 이전 자료 보정에 사용해요. */
export const DAY_SHIFT_START_MINUTES = 7 * 60;
export const DAY_SHIFT_END_MINUTES = 17 * 60 + 45;
export const NIGHT_SHIFT_START_MINUTES = 18 * 60;
export const NIGHT_SHIFT_END_MINUTES = 6 * 60 + 45;

/** 1.3.5 이전 기본 종료 시각을 현재 시각으로 안전하게 옮길 때 사용해요. */
export const LEGACY_DAY_SHIFT_END_MINUTES = 18 * 60;
export const LEGACY_NIGHT_SHIFT_END_MINUTES = 7 * 60;
