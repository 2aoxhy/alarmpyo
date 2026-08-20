/** 공식 서명 계약에서 예약한 ID입니다. 사용자·백업 데이터가 재사용할 수 없습니다. */
export const OFFICIAL_PATTERN_IDS = Object.freeze([
  'humantss_a',
  'humantss_b',
  'humantss_c',
] as const);

export type OfficialPatternId = (typeof OFFICIAL_PATTERN_IDS)[number];

const OFFICIAL_PATTERN_ID_SET = new Set<string>(OFFICIAL_PATTERN_IDS);

export function isOfficialPatternId(value: string): value is OfficialPatternId {
  return OFFICIAL_PATTERN_ID_SET.has(value);
}
