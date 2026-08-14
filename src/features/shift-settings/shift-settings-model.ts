import type {
  AppData,
  ShiftType,
  WorkRoutineProfiles,
} from '../../models/app-data';
import {
  getScheduleStartDate,
  resolveBaseShiftFromAppData,
} from '../../services/app-data-service';
import { addDays, formatDuration } from '../../utils/date';
import {
  calculateAlarmMinutes,
  calculateShiftDuration,
  formatTimeInput,
  parseTimeInput,
} from '../../utils/shift-time';
import {
  type BaseWorkShiftId,
  getWorkPatternKind,
  getWorkPatternDisplayName,
  getWorkPatternPresetId,
  type WorkPatternKind,
} from '../../utils/work-pattern';

export const ALARM_OPTIONS = [30, 60, 90, 110, 120, 180] as const;
export const SUBSTITUTE_DAY_ID = 'substitute-day';
export const SUBSTITUTE_NIGHT_ID = 'substitute-night';

export type ShiftDraft = {
  id: string;
  start: string;
  end: string;
  alarmEnabled: boolean;
  alarmMinutesBefore: number;
};

export type EditorSection = 'day' | 'evening' | 'night' | 'substitute';

export type WorkSchedulePreviewItem = {
  dateKey: string;
  shift: ShiftType | null;
};

export type WorkScheduleOverview = {
  kind: WorkPatternKind | null;
  patternName: string;
  scheduleStartDate: string;
  referenceDate: string;
  referenceShiftLabel: string;
  preview: WorkSchedulePreviewItem[];
};

export function formatAlarmOption(minutes: number): string {
  return minutes === 90 ? '90분 전' : `${formatDuration(minutes)} 전`;
}

export function isSubstituteShiftId(id: string): boolean {
  return id === SUBSTITUTE_DAY_ID || id === SUBSTITUTE_NIGHT_ID;
}

export function isNightShiftId(id: string): boolean {
  return id === 'night' || id === SUBSTITUTE_NIGHT_ID;
}

export function getEditorSectionForDraftId(id: string): EditorSection {
  if (id === 'day') return 'day';
  if (id === 'evening') return 'evening';
  if (id === 'night') return 'night';
  return 'substitute';
}

export function createShiftDrafts(shiftTypes: readonly ShiftType[]): ShiftDraft[] {
  return shiftTypes
    .filter(
      (shift) =>
        !shift.isOff &&
        shift.startMinutes !== null &&
        shift.endMinutes !== null,
    )
    .map((shift) => ({
      id: shift.id,
      start: formatTimeInput(shift.startMinutes!),
      end: formatTimeInput(shift.endMinutes!),
      alarmEnabled: shift.alarmEnabled,
      alarmMinutesBefore: shift.alarmMinutesBefore,
    }));
}

export function isShiftDraftValid(draft: ShiftDraft): boolean {
  const startMinutes = parseTimeInput(draft.start);
  const endMinutes = parseTimeInput(draft.end);
  return (
    startMinutes !== null &&
    endMinutes !== null &&
    calculateShiftDuration(startMinutes, endMinutes) !== null
  );
}

export function hasInvalidDraftForSection(
  drafts: readonly ShiftDraft[],
  section: EditorSection,
): boolean {
  return drafts.some(
    (draft) =>
      getEditorSectionForDraftId(draft.id) === section &&
      !isShiftDraftValid(draft),
  );
}

export function cloneWorkRoutineProfiles(
  profiles: WorkRoutineProfiles,
): WorkRoutineProfiles {
  return {
    day: { ...profiles.day },
    evening: { ...profiles.evening },
    night: { ...profiles.night },
  };
}

export function createShiftSettingsSnapshot(
  drafts: readonly ShiftDraft[],
  workRoutineProfiles: WorkRoutineProfiles,
): string {
  return JSON.stringify({ drafts, workRoutineProfiles });
}

export function buildWorkScheduleOverview(
  data: AppData,
  today: string,
): WorkScheduleOverview {
  const kind = getWorkPatternKind(data.pattern.shiftTypeIds);
  const presetId = getWorkPatternPresetId(data.pattern.shiftTypeIds);
  const scheduleStartDate = getScheduleStartDate(data);
  const previewStartDate = today < scheduleStartDate ? scheduleStartDate : today;
  const previewLength = data.pattern.shiftTypeIds.length;
  const referenceShiftId = data.pattern.shiftTypeIds[0];
  const referenceShift = data.shiftTypes.find(
    (shift) => shift.id === referenceShiftId,
  );

  return {
    kind,
    patternName: getWorkPatternDisplayName(
      data.pattern.shiftTypeIds,
      data.pattern.name,
    ),
    scheduleStartDate,
    referenceDate: data.pattern.anchorDate,
    referenceShiftLabel:
      presetId !== 'weekday' && referenceShift
        ? `${referenceShift.name} 첫째 날`
        : (referenceShift?.name ?? '근무 확인 필요'),
    preview: Array.from({ length: previewLength }, (_, index) => {
      const dateKey = addDays(previewStartDate, index);
      return {
        dateKey,
        shift: resolveBaseShiftFromAppData(data, dateKey),
      };
    }),
  };
}

export function formatShiftTimeSummary(
  shiftTypes: readonly ShiftType[],
  activeShiftIds: readonly string[] = ['day', 'night'],
): string {
  const formatShift = (id: string, fallback: string) => {
    const shift = shiftTypes.find((item) => item.id === id);
    if (!shift || shift.startMinutes === null || shift.endMinutes === null) {
      return fallback;
    }
    return `${shift.name} ${formatTimeInput(shift.startMinutes)}~${formatTimeInput(shift.endMinutes)}`;
  };

  const labels: Record<BaseWorkShiftId, string> = {
    day: '주간',
    evening: '오후',
    night: '야간',
    off: '휴무',
  };
  return [...new Set(activeShiftIds)]
    .filter((id): id is Exclude<BaseWorkShiftId, 'off'> =>
      id === 'day' || id === 'evening' || id === 'night',
    )
    .map((id) => formatShift(id, `${labels[id]} 시간 확인 필요`))
    .join(' · ');
}

export function formatWakeTimeSummary(
  shiftTypes: readonly ShiftType[],
  includeNight = true,
  includeEvening = false,
  includeDay = true,
): string {
  const formatWake = (id: 'day' | 'evening' | 'night', label: string) => {
    const shift = shiftTypes.find((item) => item.id === id);
    if (!shift || shift.startMinutes === null) return `${label} 확인 필요`;
    return `${label} ${formatTimeInput(
      calculateAlarmMinutes(shift.startMinutes, shift.alarmMinutesBefore),
    )}`;
  };

  return [
    includeDay ? formatWake('day', '주간') : null,
    includeEvening ? formatWake('evening', '오후') : null,
    includeNight ? formatWake('night', '야간') : null,
  ]
    .filter((label): label is string => Boolean(label))
    .join(' · ');
}

export function formatDraftWakeTimeSummary(
  drafts: readonly ShiftDraft[],
  includeNight = true,
  includeEvening = false,
  includeDay = true,
): string {
  const formatWake = (id: 'day' | 'evening' | 'night', label: string) => {
    const draft = drafts.find((item) => item.id === id);
    const startMinutes = draft ? parseTimeInput(draft.start) : null;
    if (!draft || startMinutes === null) return `${label} 확인 필요`;
    return `${label} ${formatTimeInput(
      calculateAlarmMinutes(startMinutes, draft.alarmMinutesBefore),
    )}`;
  };

  return [
    includeDay ? formatWake('day', '주간') : null,
    includeEvening ? formatWake('evening', '오후') : null,
    includeNight ? formatWake('night', '야간') : null,
  ]
    .filter((label): label is string => Boolean(label))
    .join(' · ');
}
