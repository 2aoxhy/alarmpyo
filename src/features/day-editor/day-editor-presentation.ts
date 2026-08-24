import type { DaySelection } from './day-editor-types';

export type DayShiftSummaryInput = {
  name: string;
  isOff: boolean;
  startMinutes: number | null;
  endMinutes: number | null;
  endsNextDay: boolean;
} | null;

export type DayShiftSummary = {
  title: string;
  detail: string;
  accessibilityLabel: string;
};

function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function withDirectionalParticle(label: string): string {
  const last = label.charCodeAt(label.length - 1);
  const hasFinalConsonant =
    last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${label}${hasFinalConsonant ? '으로' : '로'}`;
}

export function buildDayShiftSummary(
  shift: DayShiftSummaryInput,
  labelOverride?: string | null,
): DayShiftSummary {
  const title = labelOverride ?? shift?.name ?? '일정 없음';
  const detail =
    !shift || shift.isOff || shift.startMinutes === null || shift.endMinutes === null
      ? '근무 시간 없음'
      : `${formatClock(shift.startMinutes)}–${shift.endsNextDay ? '다음 날 ' : ''}${formatClock(shift.endMinutes)}`;
  return { title, detail, accessibilityLabel: `${title}. ${detail}` };
}

export function getDaySaveActionLabel({
  exceptionLabel,
  hasChanges,
  patternShiftName,
  restoringBaseSchedule = false,
  selectedShiftName,
  selection,
  timeIsValid,
}: {
  exceptionLabel?: string | null;
  hasChanges: boolean;
  patternShiftName?: string | null;
  restoringBaseSchedule?: boolean;
  selectedShiftName?: string | null;
  selection: DaySelection;
  timeIsValid: boolean;
}): string {
  if (!timeIsValid) return '시간 확인';
  if (!hasChanges) return '변경 내용 없음';
  if (exceptionLabel) return `${withDirectionalParticle(exceptionLabel)} 변경`;
  if (selection === null) return '일정 표시 안 함';
  if (selection === 'pattern') {
    if (restoringBaseSchedule) return '기본 일정으로 되돌리기';
    return patternShiftName ? '변경 내용 저장' : '기본 일정 적용';
  }
  return selectedShiftName
    ? `${withDirectionalParticle(selectedShiftName)} 변경`
    : '일정 변경';
}
