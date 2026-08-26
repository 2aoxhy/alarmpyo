import type { AppData, ShiftType } from '../../models/app-data';
import type { WorkSettingsSharePreview } from '../../services/work-settings-share-service';
import { addDays, formatKoreanDate } from '../../utils/date';
import {
  getPatternPositionForDate,
  getWorkPatternPreset,
  getWorkPatternPresetId,
  type BaseWorkShiftId,
  type WorkPatternPresetId,
} from '../../utils/work-pattern';

export type QuickSetupSource = 'received-file' | 'direct';
export type QuickSetupStep = 'schedule-source' | 'schedule-anchor' | 'alarm-readiness';

export type QuickSetupDraftV1 = {
  version: 1;
  source: QuickSetupSource | null;
  step: QuickSetupStep;
  presetId: WorkPatternPresetId;
  sequence: BaseWorkShiftId[];
  referenceDate: string;
  position: number | null;
  receivedPreview: WorkSettingsSharePreview | null;
};

export type QuickSetupOption = {
  detail: string;
  groupId: QuickSetupGroupId;
  label: string;
  presetId: WorkPatternPresetId;
  sequence: readonly BaseWorkShiftId[];
};

export type QuickSetupGroupId = 'weekday' | 'two-shift' | 'three-shift' | 'custom';

export type QuickSetupGroup = {
  detail: string;
  id: QuickSetupGroupId;
  label: string;
};

export type QuickSetupShiftTimeRow = Pick<
  ShiftType,
  'id' | 'name' | 'startMinutes' | 'endMinutes'
>;

const QUICK_PRESET_IDS: readonly Exclude<WorkPatternPresetId, 'custom'>[] = [
  'weekday',
  'two-team-two-shift',
  'three-team-two-shift',
  'four-team-two-shift',
  'three-team-three-shift',
  'four-team-three-shift',
];

const QUICK_GROUPS: Readonly<Record<(typeof QUICK_PRESET_IDS)[number], QuickSetupGroupId>> = {
  weekday: 'weekday',
  'two-team-two-shift': 'two-shift',
  'three-team-two-shift': 'two-shift',
  'four-team-two-shift': 'two-shift',
  'three-team-three-shift': 'three-shift',
  'four-team-three-shift': 'three-shift',
};

export const QUICK_SETUP_GROUPS: readonly QuickSetupGroup[] = [
  { id: 'weekday', label: '주간 고정', detail: '평일 주간 근무' },
  { id: 'two-shift', label: '2교대', detail: '주간·야간 교대' },
  { id: 'three-shift', label: '3교대', detail: '주간·오후·야간 교대' },
  { id: 'custom', label: '직접 설정', detail: '회사 근무 순서를 직접 만듭니다' },
] as const;

const SHIFT_LABELS: Readonly<Record<BaseWorkShiftId, string>> = {
  day: '주간',
  evening: '오후',
  night: '야간',
  off: '휴무',
};

export const QUICK_SETUP_OPTIONS: readonly QuickSetupOption[] = QUICK_PRESET_IDS.map(
  (presetId) => {
    const preset = getWorkPatternPreset(presetId);
    return {
      detail: `예시: ${formatQuickSequence(preset.shiftTypeIds)}`,
      groupId: QUICK_GROUPS[presetId],
      label: preset.shortName,
      presetId,
      sequence: preset.shiftTypeIds,
    };
  },
);

export function formatQuickSequence(sequence: readonly BaseWorkShiftId[]): string {
  return sequence.map((id) => SHIFT_LABELS[id]).join(' → ');
}

export function createQuickSetupDraft(data: AppData, today: string): QuickSetupDraftV1 {
  const sequence = data.pattern.shiftTypeIds.filter(
    (id): id is BaseWorkShiftId =>
      id === 'day' || id === 'evening' || id === 'night' || id === 'off',
  );
  const safeSequence = sequence.length > 0
    ? sequence
    : [...getWorkPatternPreset('three-team-two-shift').shiftTypeIds];
  const presetId = getWorkPatternPresetId(safeSequence);
  const position = getPatternPositionForDate({
    date: today,
    referenceDate: data.pattern.anchorDate,
    referencePosition: 0,
    sequenceLength: safeSequence.length,
  });
  return {
    version: 1,
    source: null,
    step: 'schedule-source',
    presetId,
    sequence: [...safeSequence],
    referenceDate: today,
    position,
    receivedPreview: null,
  };
}

export function createQuickPreview(
  sequence: readonly BaseWorkShiftId[],
  referenceDate: string,
  position: number,
  days = 7,
) {
  if (sequence.length === 0 || position < 0 || position >= sequence.length) return [];
  return Array.from({ length: days }, (_, offset) => {
    const dateKey = addDays(referenceDate, offset);
    const shiftTypeId = sequence[(position + offset) % sequence.length];
    return {
      dateKey,
      dateLabel: formatKoreanDate(dateKey),
      shiftTypeId,
      shiftLabel: SHIFT_LABELS[shiftTypeId],
    };
  });
}

/**
 * 받은 파일 흐름에서는 적용될 파일 시간을, 직접 선택 흐름에서는 현재 휴대폰의
 * 시간을 보여 줍니다. 화면에서 현재 값과 적용 예정 값을 섞어 보여 주지 않도록
 * 한곳에서 결정합니다.
 */
export function resolveQuickSetupShiftTimeRows(
  draft: Pick<QuickSetupDraftV1, 'receivedPreview' | 'sequence' | 'source'>,
  currentShiftTypes: readonly ShiftType[],
): QuickSetupShiftTimeRow[] {
  const activeIds = [...new Set(draft.sequence.filter((id) => id !== 'off'))];
  return activeIds.flatMap((id) => {
    const current = currentShiftTypes.find((shift) => shift.id === id);
    const received =
      draft.source === 'received-file'
        ? draft.receivedPreview?.document.workSettings.shiftTypes.find(
            (shift) => shift.id === id,
          )
        : undefined;
    const timing = received ?? current;
    if (!timing) return [];
    return [
      {
        id,
        name: current?.name ?? SHIFT_LABELS[id],
        startMinutes: timing.startMinutes,
        endMinutes: timing.endMinutes,
      },
    ];
  });
}

export function formatQuickPositionLabel(
  sequence: readonly BaseWorkShiftId[],
  index: number,
): string {
  const id = sequence[index];
  const total = sequence.filter((candidate) => candidate === id).length;
  const occurrence = sequence.slice(0, index + 1).filter((candidate) => candidate === id).length;
  return total > 1 ? `${SHIFT_LABELS[id]} ${occurrence}일차` : SHIFT_LABELS[id];
}
