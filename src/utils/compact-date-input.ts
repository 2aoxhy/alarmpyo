import { isValidDateKey } from './date';
import { CALENDAR_MAX_YEAR, CALENDAR_MIN_YEAR } from './calendar-month';

export type CompactDateInputResult =
  | { valid: true; dateKey: string }
  | { valid: false; input: string; error: string };

export type CompactDateInputUpdate = {
  dateKey: string | null;
  input: string;
};

const SUPPORTED_LENGTHS = new Set([4, 6, 8]);

function toDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 현장 입력을 위한 짧은 날짜 형식입니다.
 * 2682는 26년 8월 2일, 260802는 26년 8월 2일로 해석합니다.
 */
export function normalizeCompactDateInput(input: string): CompactDateInputResult {
  const normalized = input.trim();
  if (isValidDateKey(normalized)) return { valid: true, dateKey: normalized };
  if (/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    return {
      valid: false,
      input: normalized,
      error: '존재하지 않는 날짜입니다.',
    };
  }
  if (normalized.length === 0) {
    return { valid: false, input: normalized, error: '날짜를 입력해야 합니다.' };
  }
  if (!/^\d+$/u.test(normalized)) {
    return {
      valid: false,
      input: normalized,
      error: '숫자 4·6·8자리 또는 연도-월-일로 입력합니다.',
    };
  }
  if (!SUPPORTED_LENGTHS.has(normalized.length)) {
    return {
      valid: false,
      input: normalized,
      error: '날짜는 숫자 4·6·8자리로 입력합니다.',
    };
  }

  let year: number;
  let month: number;
  let day: number;
  if (normalized.length === 4) {
    year = 2000 + Number(normalized.slice(0, 2));
    month = Number(normalized.slice(2, 3));
    day = Number(normalized.slice(3, 4));
  } else if (normalized.length === 6) {
    year = 2000 + Number(normalized.slice(0, 2));
    month = Number(normalized.slice(2, 4));
    day = Number(normalized.slice(4, 6));
  } else {
    year = Number(normalized.slice(0, 4));
    month = Number(normalized.slice(4, 6));
    day = Number(normalized.slice(6, 8));
  }

  const dateKey = toDateKey(year, month, day);
  return isValidDateKey(dateKey)
    ? { valid: true, dateKey }
    : { valid: false, input: normalized, error: '존재하지 않는 날짜입니다.' };
}

/**
 * 6·8자리는 즉시 하이픈을 적용합니다. 4자리는 6자리 입력의 앞부분과
 * 겹칠 수 있어 입력 완료(blur/submit) 시 확정합니다.
 */
export function formatCompactDateInputChange(input: string): string {
  const normalized = input.trim();
  if (!/^\d{6}(?:\d{2})?$/u.test(normalized)) return normalized;
  if (normalized.length === 6) {
    const possibleFourDigitYear = Number(normalized.slice(0, 4));
    if (
      possibleFourDigitYear >= CALENDAR_MIN_YEAR &&
      possibleFourDigitYear <= CALENDAR_MAX_YEAR
    ) {
      return normalized;
    }
  }
  const result = normalizeCompactDateInput(normalized);
  return result.valid ? result.dateKey : normalized;
}

/**
 * 직접 입력 중 화면에 둘 문자열과 외부 상태에 확정할 날짜를 분리합니다.
 *
 * 4자리는 6·8자리 입력의 앞부분일 수 있어 입력 완료 전에는 확정하지 않습니다.
 * 6·8자리나 이미 정규화된 날짜는 유효할 때만 외부 상태에 반영합니다.
 */
export function createCompactDateInputUpdate(
  input: string,
  { finalize = false }: { finalize?: boolean } = {},
): CompactDateInputUpdate {
  const formattedInput = formatCompactDateInputChange(input);
  const result = normalizeCompactDateInput(formattedInput);
  const canCommit =
    result.valid && (finalize || isValidDateKey(formattedInput));
  return {
    input: canCommit ? result.dateKey : formattedInput,
    dateKey: canCommit ? result.dateKey : null,
  };
}
