import type {
  ShiftType,
  WorkRoutineProfiles,
} from '../models/app-data';
import { dateAtMinutes, isValidDateKey } from '../utils/date';
import {
  DEFAULT_WORK_ROUTINE_PROFILES,
  getWorkRoutineTimingForShift,
  isValidWorkRoutineTiming,
  resolveWorkRoutineKind,
} from './work-routine-settings';

export const ROUTINE_ALARM_LEAD_MINUTES = 110;
export const MAX_ROUTINE_ALARM_LEAD_MINUTES = 6 * 60;

const MINUTE_IN_MS = 60_000;

export type WorkRoutineKind = 'day' | 'evening' | 'night';

export type WorkRoutineStepId =
  | 'wake-and-shower'
  | 'wake-and-prepare'
  | 'dress-and-prepare'
  | 'meal-and-water'
  | 'meal-or-snack'
  | 'belongings-check'
  | 'depart'
  | 'arrive-and-change'
  | 'final-prepare'
  | 'handover'
  | 'ready-for-work';

export type WorkRoutineStep = {
  id: WorkRoutineStepId;
  at: number;
  endAt: number;
  instruction: string;
};

export type WorkRoutinePlan = {
  kind: WorkRoutineKind;
  title: string;
  wakeAt: number;
  departAt: number;
  arriveAt: number;
  /** 교대를 마치는 시각이에요. */
  handoverAt: number;
  workStartAt: number;
  summary: string;
  steps: WorkRoutineStep[];
  currentStep: WorkRoutineStep | null;
};

type RoutineStepTemplate = {
  id: WorkRoutineStepId;
  weight: number;
  instruction: string;
};

const DAY_PREP_STEP_TEMPLATES: readonly RoutineStepTemplate[] = [
  {
    id: 'wake-and-shower',
    weight: 20,
    instruction: '기상한 뒤 샤워하고 머리를 말려야 합니다.',
  },
  {
    id: 'dress-and-prepare',
    weight: 15,
    instruction: '복장을 갖추고 출근 준비를 해야 합니다.',
  },
  {
    id: 'meal-and-water',
    weight: 10,
    instruction: '간단히 먹고 물을 챙겨야 합니다.',
  },
  {
    id: 'belongings-check',
    weight: 5,
    instruction: '신분증·휴대폰·출입 관련 준비물을 확인해야 합니다.',
  },
];

const NIGHT_PREP_STEP_TEMPLATES: readonly RoutineStepTemplate[] = [
  {
    id: 'wake-and-prepare',
    weight: 25,
    instruction: '기상한 뒤 샤워하고 출근 준비를 해야 합니다.',
  },
  {
    id: 'meal-or-snack',
    weight: 15,
    instruction: '식사하거나 간단한 간식을 드셔야 합니다.',
  },
  {
    id: 'belongings-check',
    weight: 10,
    instruction: '준비물을 확인해야 합니다.',
  },
];

function isValidShiftMinute(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 0 && value < 24 * 60;
}

function timestampBefore(workStartAt: number, leadMinutes: number): number {
  return workStartAt - leadMinutes * MINUTE_IN_MS;
}

function distributeRoutineSteps(
  templates: readonly RoutineStepTemplate[],
  startAt: number,
  endAt: number,
): WorkRoutineStep[] {
  if (endAt <= startAt || templates.length === 0) return [];
  const totalWeight = templates.reduce((total, template) => total + template.weight, 0);
  const duration = endAt - startAt;
  const baseDuration = totalWeight * MINUTE_IN_MS;
  if (duration >= baseDuration) {
    let cursor = startAt;
    const extraFirstStepDuration = duration - baseDuration;
    return templates.map((template, index) => {
      const at = cursor;
      cursor +=
        template.weight * MINUTE_IN_MS +
        (index === 0 ? extraFirstStepDuration : 0);
      return {
        id: template.id,
        at,
        endAt: index === templates.length - 1 ? endAt : cursor,
        instruction: template.instruction,
      };
    });
  }
  let cumulativeWeight = 0;
  return templates.map((template, index) => {
    const at =
      index === 0
        ? startAt
        : startAt + Math.round((duration * cumulativeWeight) / totalWeight);
    cumulativeWeight += template.weight;
    const stepEndAt =
      index === templates.length - 1
        ? endAt
        : startAt + Math.round((duration * cumulativeWeight) / totalWeight);
    return {
      id: template.id,
      at,
      endAt: stepEndAt,
      instruction: template.instruction,
    };
  });
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function resolveRoutineAlarmLeadMinutes(shift: ShiftType): {
  minutes: number;
  usesFallback: boolean;
} {
  if (
    Number.isInteger(shift.alarmMinutesBefore) &&
    shift.alarmMinutesBefore >= 1 &&
    shift.alarmMinutesBefore <= MAX_ROUTINE_ALARM_LEAD_MINUTES
  ) {
    return { minutes: shift.alarmMinutesBefore, usesFallback: false };
  }
  return { minutes: ROUTINE_ALARM_LEAD_MINUTES, usesFallback: true };
}

export function canBuildWorkRoutinePlan(
  shift: ShiftType,
  profiles: Readonly<WorkRoutineProfiles>,
): shift is ShiftType & { startMinutes: number; endMinutes: number } {
  if (
    shift.isOff ||
    !isValidShiftMinute(shift.startMinutes) ||
    !isValidShiftMinute(shift.endMinutes) ||
    shift.startMinutes === shift.endMinutes
  ) {
    return false;
  }
  const timing = getWorkRoutineTimingForShift(profiles, shift);
  return (
    isValidWorkRoutineTiming(timing) &&
    resolveRoutineAlarmLeadMinutes(shift).minutes >
      timing.departMinutesBefore
  );
}

/**
 * 최종 근무 시작 시각을 기준으로 출근 준비 루틴을 계산합니다.
 * 날짜별 시간 변경이 적용된 근무를 전달하면 모든 단계가 같은 간격으로 이동합니다.
 */
export function buildWorkRoutinePlan(
  dateKey: string,
  shift: ShiftType,
  now: Date = new Date(),
  profiles: Readonly<WorkRoutineProfiles> = DEFAULT_WORK_ROUTINE_PROFILES,
): WorkRoutinePlan | null {
  if (
    !isValidDateKey(dateKey) ||
    !canBuildWorkRoutinePlan(shift, profiles)
  ) {
    return null;
  }
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('근무 루틴 계산 시각이 올바르지 않습니다.');
  }

  const kind = resolveWorkRoutineKind(shift);
  const workStartAt = dateAtMinutes(dateKey, shift.startMinutes).getTime();
  const wakeLead = resolveRoutineAlarmLeadMinutes(shift).minutes;
  const timing = getWorkRoutineTimingForShift(profiles, shift);
  const wakeAt = timestampBefore(workStartAt, wakeLead);
  const departAt = timestampBefore(workStartAt, timing.departMinutesBefore);
  const arriveAt = timestampBefore(workStartAt, timing.arriveMinutesBefore);
  const handoverAt = timestampBefore(workStartAt, timing.handoverMinutesBefore);
  const prepTemplates =
    kind === 'night'
      ? NIGHT_PREP_STEP_TEMPLATES
      : DAY_PREP_STEP_TEMPLATES;
  const arrivalToHandoverMinutes =
    (handoverAt - arriveAt) / MINUTE_IN_MS;
  const arrivalChangeEnd =
    arriveAt + Math.round(arrivalToHandoverMinutes / 3) * MINUTE_IN_MS;
  const handoverStartAt =
    arriveAt + Math.round((arrivalToHandoverMinutes * 2) / 3) * MINUTE_IN_MS;
  const milestoneSteps: WorkRoutineStep[] = [
    {
      id: 'depart',
      at: departAt,
      endAt: arriveAt,
      instruction: '회사로 출발해야 합니다.',
    },
    {
      id: 'arrive-and-change',
      at: arriveAt,
      endAt: arrivalChangeEnd,
      instruction: '도착 후 옷을 갈아입고 복장을 정리해야 합니다.',
    },
    {
      id: 'final-prepare',
      at: arrivalChangeEnd,
      endAt: handoverStartAt,
      instruction: '교대 전 준비를 마무리해야 합니다.',
    },
    {
      id: 'handover',
      at: handoverStartAt,
      endAt: handoverAt,
      instruction: '교대를 마쳐야 합니다.',
    },
    {
      id: 'ready-for-work',
      at: handoverAt,
      endAt: workStartAt,
      instruction: '교대 후 실제 근무 시작을 준비해야 합니다.',
    },
  ];
  const steps: WorkRoutineStep[] = [
    ...distributeRoutineSteps(prepTemplates, wakeAt, departAt),
    ...milestoneSteps,
  ].filter((step) => step.endAt > step.at);
  const nowTimestamp = now.getTime();
  const currentStep =
    steps.find((step) => step.at <= nowTimestamp && nowTimestamp < step.endAt) ?? null;

  return {
    kind,
    title:
      kind === 'night'
        ? '야간 출근 루틴'
        : kind === 'evening'
          ? '오후 출근 루틴'
          : '주간 출근 루틴',
    wakeAt,
    departAt,
    arriveAt,
    handoverAt,
    workStartAt,
    summary: `${formatClock(wakeAt)} 기상 · ${formatClock(departAt)} 출발 · ${formatClock(handoverAt)} 교대 완료`,
    steps,
    currentStep,
  };
}
