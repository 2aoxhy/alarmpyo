import type {
  AppData,
  PatternShiftCode,
  PatternVaultEntry,
} from '../../models/app-data';
import { PatternEngine } from '../../services/pattern-engine';
import type {
  PatternApplicationInput,
  PatternApplicationPreviewRow,
  PatternOverridePolicy,
} from '../../services/pattern-vault-service';
import { previewPatternApplication } from '../../services/pattern-vault-service';
import {
  addDays,
  differenceInCalendarDays,
  formatCompactTime,
  formatKoreanDate,
  formatMonthTitle,
  parseDateKey,
} from '../../utils/date';

export const MAX_PATTERN_LENGTH = 42;
export const PATTERN_PREVIEW_DAYS = 42;

/** Preview inputs are explicit so a stable engine command cannot stale a memo. */
export function createPatternApplicationPreview(data: AppData, input: PatternApplicationInput) {
  return previewPatternApplication(data, input);
}

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

/**
 * 편집 화면에서만 사용하는 연속 근무 구간입니다. 저장 경계에서는 반드시
 * 기존 PatternShiftCode[]로 펼쳐 AppData와 공유 파일 계약을 유지합니다.
 */
export type PatternComposerSegment = {
  shiftCode: PatternShiftCode;
  days: number;
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

export type PatternPreviewMonth = {
  key: string;
  year: number;
  month: number;
  label: string;
};

export type PatternSevenDaySummary = {
  rows: PatternSevenDaySummaryRow[];
  changedDateCount: number;
  preservedOverrideDateCount: number;
  removedOverrideDateCount: number;
};

export type PatternSevenDaySummaryRow = PatternDiffRow & {
  directOverrideResolution: 'preserve' | 'remove' | null;
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

export function compressPatternShiftCodes(
  codes: readonly PatternShiftCode[],
): PatternComposerSegment[] {
  return codes.reduce<PatternComposerSegment[]>((segments, shiftCode) => {
    const previous = segments[segments.length - 1];
    if (previous?.shiftCode === shiftCode) {
      previous.days += 1;
    } else {
      segments.push({ shiftCode, days: 1 });
    }
    return segments;
  }, []);
}

export function normalizePatternComposerSegments(
  segments: readonly PatternComposerSegment[],
): PatternComposerSegment[] {
  return segments.reduce<PatternComposerSegment[]>((normalized, segment) => {
    const previous = normalized[normalized.length - 1];
    if (previous?.shiftCode === segment.shiftCode) {
      previous.days += segment.days;
    } else {
      normalized.push({ ...segment });
    }
    return normalized;
  }, []);
}

export function expandPatternComposerSegments(
  segments: readonly PatternComposerSegment[],
): PatternShiftCode[] {
  return segments.flatMap((segment) =>
    Array.from({ length: segment.days }, () => segment.shiftCode),
  );
}

export function getPatternComposerTotalDays(
  segments: readonly PatternComposerSegment[],
): number {
  return segments.reduce((total, segment) => total + segment.days, 0);
}

export function isPatternComposerValid(
  segments: readonly PatternComposerSegment[],
): boolean {
  const totalDays = getPatternComposerTotalDays(segments);
  return (
    segments.length > 0 &&
    totalDays >= 1 &&
    totalDays <= MAX_PATTERN_LENGTH &&
    segments.every(
      (segment) => Number.isInteger(segment.days) && segment.days >= 1,
    )
  );
}

export function formatPatternComposerName(
  segments: readonly PatternComposerSegment[],
): string {
  const parts = segments.map((segment) => {
    const label = getPatternShiftOption(segment.shiftCode).shortLabel;
    return `${label}${segment.days}일`;
  });
  const fullName = parts.join(' · ');
  if (fullName.length <= 80) return fullName;

  const visible = parts.slice(0, 6);
  return `${visible.join(' · ')} · 외 ${parts.length - visible.length}구간`;
}

export function buildPatternSevenDaySummary(
  {
    mode,
    rows,
    selectedDateKeys,
  }: {
    mode: OverrideResolutionMode;
    rows: readonly PatternDiffRow[];
    selectedDateKeys: ReadonlySet<string>;
  },
): PatternSevenDaySummary {
  const summaryRows = rows.slice(0, 7).map((row): PatternSevenDaySummaryRow => {
    const directOverrideResolution = !row.hasDirectOverride
      ? null
      : mode === 'preserve' ||
          (mode === 'select' && selectedDateKeys.has(row.dateKey))
        ? 'preserve'
        : 'remove';
    return { ...row, directOverrideResolution };
  });
  return {
    rows: summaryRows,
    changedDateCount: summaryRows.filter(isPatternDiffRowChanged).length,
    preservedOverrideDateCount: summaryRows.filter(
      (row) => row.directOverrideResolution === 'preserve',
    ).length,
    removedOverrideDateCount: summaryRows.filter(
      (row) => row.directOverrideResolution === 'remove',
    ).length,
  };
}

export function formatPatternApplyActionLabel({
  changedDateCount,
  clearedOverrideDateCount,
}: {
  changedDateCount: number;
  clearedOverrideDateCount: number;
}): string {
  if (clearedOverrideDateCount > 0) {
    return `직접 수정 ${clearedOverrideDateCount}개 정리 후 적용`;
  }
  if (changedDateCount === 0) return '변경 없이 적용';
  return `변경 ${changedDateCount}일 적용`;
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
          ? '패턴 이름 입력'
          : '패턴 이름은 80자 이하',
    };
  }
  if (draft.shiftCodes.length === 0) {
    return {
      valid: false,
      issue: 'sequence-required',
      message: '근무 순서를 1일 이상 추가',
    };
  }
  if (draft.shiftCodes.length > MAX_PATTERN_LENGTH) {
    return {
      valid: false,
      issue: 'sequence-too-long',
      message: '근무 순서는 42일 이하',
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

export function getPatternPreviewMonthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Store가 계산한 적용 미리보기 행만 월 단위 화면으로 묶습니다. */
export function buildPatternPreviewMonths(
  rows: readonly PatternDiffRow[],
): PatternPreviewMonth[] {
  const seen = new Set<string>();
  const months: PatternPreviewMonth[] = [];
  for (const row of rows) {
    const key = getPatternPreviewMonthKey(row.dateKey);
    if (seen.has(key)) continue;
    seen.add(key);
    const date = parseDateKey(row.dateKey);
    months.push({
      key,
      year: date.getFullYear(),
      month: date.getMonth(),
      label: formatMonthTitle(date.getFullYear(), date.getMonth()),
    });
  }
  return months;
}

export function isPatternDiffRowChanged(row: PatternDiffRow): boolean {
  return row.changed;
}

export function resolvePatternPreviewRow(
  rows: readonly PatternDiffRow[],
  requestedDateKey: string | null,
  requestedMonthKey: string | null = null,
): PatternDiffRow | null {
  return (
    rows.find((row) => row.dateKey === requestedDateKey) ??
    rows.find(
      (row) => getPatternPreviewMonthKey(row.dateKey) === requestedMonthKey,
    ) ??
    rows[0] ??
    null
  );
}

export function formatPatternCalendarShiftToken(
  shiftTypeId: string | null,
  label: string,
): string {
  if (shiftTypeId === null) return '—';
  const knownToken: Readonly<Record<string, string>> = {
    day: '주',
    evening: '오',
    night: '야',
    off: '휴',
    'substitute-day': '주대',
    'substitute-night': '야대',
    'exception-leave': '연',
    'exception-training': '교',
    'exception-reserve': '예',
  };
  return (
    knownToken[shiftTypeId] ??
    Array.from(label.replace(/\s+/g, '')).slice(0, 2).join('')
  );
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
