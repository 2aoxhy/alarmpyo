import type {
  AppData,
  PatternShiftCode,
  PatternVaultEntry,
} from '../../models/app-data';
import { PatternEngine } from '../../services/pattern-engine';
import type {
  PatternApplicationPreviewRow,
  PatternOverridePolicy,
} from '../../services/pattern-vault-service';
import {
  addDays,
  differenceInCalendarDays,
  formatCompactTime,
  formatKoreanDate,
} from '../../utils/date';

export const MAX_PATTERN_LENGTH = 42;
export const PATTERN_PREVIEW_DAYS = 42;

export const PATTERN_SHIFT_OPTIONS: readonly {
  code: PatternShiftCode;
  label: string;
  shortLabel: string;
  shiftTypeId: string;
}[] = [
  { code: 'DAY', label: '주간', shortLabel: '주', shiftTypeId: 'day' },
  { code: 'EVENING', label: '오후', shortLabel: '오', shiftTypeId: 'evening' },
  { code: 'NIGHT', label: '야간', shortLabel: '야', shiftTypeId: 'night' },
  { code: 'OFF', label: '휴무', shortLabel: '휴', shiftTypeId: 'off' },
  {
    code: 'DAY_SUBSTITUTE',
    label: '주간 대체근무',
    shortLabel: '주대',
    shiftTypeId: 'substitute-day',
  },
  {
    code: 'NIGHT_SUBSTITUTE',
    label: '야간 대체근무',
    shortLabel: '야대',
    shiftTypeId: 'substitute-night',
  },
] as const;

export type PatternDraft = {
  id: string | null;
  name: string;
  shiftCodes: PatternShiftCode[];
};

export type PatternDraftIssue = 'name-required' | 'sequence-required' | 'sequence-too-long';

export type PatternDraftValidation = {
  valid: boolean;
  issue: PatternDraftIssue | null;
  message: string | null;
};

export type OverrideResolutionMode = 'preserve' | 'remove-all' | 'select';

export type PatternDiffRow = {
  dateKey: string;
  dateLabel: string;
  currentShiftTypeId: string | null;
  currentLabel: string;
  currentTimeLabel: string | null;
  nextShiftTypeId: string;
  nextLabel: string;
  nextTimeLabel: string | null;
  changed: boolean;
  scheduledShiftChanged: boolean;
  hasDirectOverride: boolean;
};

export function getPatternShiftOption(code: PatternShiftCode) {
  return PATTERN_SHIFT_OPTIONS.find((option) => option.code === code)!;
}

export function patternShiftCodeToId(code: PatternShiftCode): string {
  return getPatternShiftOption(code).shiftTypeId;
}

export function patternShiftIdToCode(shiftTypeId: string): PatternShiftCode | null {
  return (
    PATTERN_SHIFT_OPTIONS.find((option) => option.shiftTypeId === shiftTypeId)?.code ?? null
  );
}

export function formatPatternSequence(codes: readonly PatternShiftCode[]): string {
  return codes.map((code) => getPatternShiftOption(code).shortLabel).join(' → ');
}

export function createPatternDraft(entry?: PatternVaultEntry): PatternDraft {
  return entry
    ? { id: entry.id, name: entry.name, shiftCodes: [...entry.shiftCodes] }
    : { id: null, name: '', shiftCodes: ['DAY', 'NIGHT', 'OFF'] };
}

export function validatePatternDraft(draft: PatternDraft): PatternDraftValidation {
  if (draft.name.trim().length === 0 || draft.name.normalize('NFC').length > 80) {
    return {
      valid: false,
      issue: 'name-required',
      message:
        draft.name.trim().length === 0
          ? '패턴 이름을 입력해야 합니다.'
          : '패턴 이름은 80자 이하여야 합니다.',
    };
  }
  if (draft.shiftCodes.length === 0) {
    return {
      valid: false,
      issue: 'sequence-required',
      message: '근무 순서를 1일 이상 추가해야 합니다.',
    };
  }
  if (draft.shiftCodes.length > MAX_PATTERN_LENGTH) {
    return {
      valid: false,
      issue: 'sequence-too-long',
      message: '근무 순서는 42일 이하여야 합니다.',
    };
  }
  return { valid: true, issue: null, message: null };
}

function patternIndex(anchorDate: string, dateKey: string, length: number): number {
  const offset = differenceInCalendarDays(dateKey, anchorDate);
  return ((offset % length) + length) % length;
}

export function buildPatternDiffRows({
  data,
  entry,
  startDate,
}: {
  data: AppData;
  entry: PatternVaultEntry;
  startDate: string;
}): PatternDiffRow[] {
  return Array.from({ length: PATTERN_PREVIEW_DAYS }, (_, index) => {
    const dateKey = addDays(startDate, index);
    const current = PatternEngine.resolveEffectiveDay(data, dateKey).scheduledShift;
    const nextCode = entry.shiftCodes[
      patternIndex(entry.anchorDate, dateKey, entry.shiftCodes.length)
    ];
    const nextOption = getPatternShiftOption(nextCode);
    const currentLabel = current?.shortName ?? '일정 없음';
    const hasDirectOverride =
      Object.prototype.hasOwnProperty.call(data.overrides, dateKey) ||
      Object.prototype.hasOwnProperty.call(data.timeOverrides, dateKey);
    return {
      dateKey,
      dateLabel: formatKoreanDate(dateKey),
      currentShiftTypeId: current?.id ?? null,
      currentLabel,
      currentTimeLabel:
        current?.startMinutes === null || current?.startMinutes === undefined || current.endMinutes === null
          ? null
          : `${formatCompactTime(current.startMinutes)}~${formatCompactTime(current.endMinutes)}`,
      nextShiftTypeId: nextOption.shiftTypeId,
      nextLabel: nextOption.shortLabel,
      nextTimeLabel: null,
      changed: current?.id !== nextOption.shiftTypeId,
      scheduledShiftChanged: current?.id !== nextOption.shiftTypeId,
      hasDirectOverride,
    };
  });
}

export function adaptPatternApplicationPreviewRows(
  shiftTypes: AppData['shiftTypes'],
  rows: readonly PatternApplicationPreviewRow[],
): PatternDiffRow[] {
  const labelFor = (shiftTypeId: string | null) => {
    if (shiftTypeId === null) return '일정 없음';
    if (shiftTypeId === 'exception-leave') return '연차';
    if (shiftTypeId === 'exception-training') return '교육';
    if (shiftTypeId === 'exception-reserve') return '예비군';
    return shiftTypes.find((shift) => shift.id === shiftTypeId)?.shortName ?? shiftTypeId;
  };
  const timeFor = (start: number | null, end: number | null) =>
    start === null || end === null
      ? null
      : `${formatCompactTime(start)}~${formatCompactTime(end)}`;
  return rows.map((row) => ({
    dateKey: row.dateKey,
    dateLabel: formatKoreanDate(row.dateKey),
    currentShiftTypeId: row.currentShiftTypeId,
    currentLabel: labelFor(row.currentShiftTypeId),
    currentTimeLabel: timeFor(row.currentStartMinutes, row.currentEndMinutes),
    nextShiftTypeId: row.nextShiftTypeId ?? 'off',
    nextLabel: labelFor(row.nextShiftTypeId),
    nextTimeLabel: timeFor(row.nextStartMinutes, row.nextEndMinutes),
    changed: row.changed,
    scheduledShiftChanged: row.scheduledShiftChanged,
    hasDirectOverride: row.hasDirectOverride,
  }));
}

export function getPreservedOverrideDateKeys({
  mode,
  rows,
  selectedDateKeys,
}: {
  mode: OverrideResolutionMode;
  rows: readonly PatternDiffRow[];
  selectedDateKeys: ReadonlySet<string>;
}): string[] {
  const overrideDates = rows.filter((row) => row.hasDirectOverride).map((row) => row.dateKey);
  if (mode === 'preserve') return overrideDates;
  if (mode === 'remove-all') return [];
  return overrideDates.filter((dateKey) => selectedDateKeys.has(dateKey));
}

/**
 * 화면은 유지할 날짜를 선택하지만 Store selective.dateKeys는 제거할
 * 날짜입니다. 이 경계에서만 반전하여 의미가 뒤바뀌지 않게 합니다.
 */
export function buildPatternOverridePolicy({
  directOverrideDateKeys,
  mode,
  preservedDateKeys,
}: {
  directOverrideDateKeys: readonly string[];
  mode: OverrideResolutionMode;
  preservedDateKeys: ReadonlySet<string>;
}): PatternOverridePolicy {
  if (mode === 'preserve') return { mode: 'preserve' };
  if (mode === 'remove-all') return { mode: 'clear-all' };
  return {
    mode: 'selective',
    dateKeys: directOverrideDateKeys.filter((dateKey) => !preservedDateKeys.has(dateKey)),
  };
}

export function formatPatternDayAccessibilityLabel(
  index: number,
  total: number,
  code: PatternShiftCode,
): string {
  return `${index + 1}/${total}, ${getPatternShiftOption(code).label}`;
}

export function formatPatternSource(source: PatternVaultEntry['source']): string {
  switch (source) {
    case 'official':
      return '공식';
    case 'imported':
      return '가져온 패턴';
    default:
      return '내 패턴';
  }
}
