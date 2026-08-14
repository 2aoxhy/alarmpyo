export const LARGE_TEXT_CALENDAR_SCALE = 1.4;
export const NARROW_CONTROL_WIDTH = 340;
export const HERO_FOOTER_STACK_SCALE = 1.3;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 큰 글자에서는 달력 칸의 정보를 핵심 상태만 남기는 기준이에요. */
export function usesSimplifiedCalendar(fontScale: number): boolean {
  return finiteOr(fontScale, 1) >= LARGE_TEXT_CALENDAR_SCALE;
}

/** 좁은 화면이나 큰 글자에서 행과 버튼의 보조 내용을 자연스럽게 줄바꿈해요. */
export function shouldReflowControl(width: number, fontScale: number): boolean {
  return (
    finiteOr(width, NARROW_CONTROL_WIDTH) < NARROW_CONTROL_WIDTH ||
    finiteOr(fontScale, 1) >= LARGE_TEXT_CALENDAR_SCALE
  );
}

/** 320dp 또는 130% 이상 글자에서 오늘 카드의 값과 동작을 세로로 배치해요. */
export function shouldStackHeroFooter(width: number, fontScale: number): boolean {
  return (
    finiteOr(width, NARROW_CONTROL_WIDTH) < NARROW_CONTROL_WIDTH ||
    finiteOr(fontScale, 1) >= HERO_FOOTER_STACK_SCALE
  );
}
