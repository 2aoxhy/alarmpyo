import type {
  ShiftType,
  WorkRoutineProfiles,
  WorkRoutineTiming,
} from '../models/app-data';

export const WORK_ROUTINE_MINUTES_STEP = 5;
export const WORK_ROUTINE_MIN_MINUTES_BEFORE = 5;
// 기상 시각은 최대 6시간 전까지 계산하므로, 출발은 그보다 최소 5분 뒤여야 해요.
export const WORK_ROUTINE_MAX_MINUTES_BEFORE = 6 * 60 - WORK_ROUTINE_MINUTES_STEP;

export const DEFAULT_WORK_ROUTINE_TIMING: Readonly<WorkRoutineTiming> = {
  departMinutesBefore: 60,
  arriveMinutesBefore: 45,
  handoverMinutesBefore: 15,
};

export const DEFAULT_WORK_ROUTINE_PROFILES: Readonly<WorkRoutineProfiles> = {
  day: DEFAULT_WORK_ROUTINE_TIMING,
  night: DEFAULT_WORK_ROUTINE_TIMING,
};

export function createDefaultWorkRoutineProfiles(): WorkRoutineProfiles {
  return {
    day: { ...DEFAULT_WORK_ROUTINE_TIMING },
    night: { ...DEFAULT_WORK_ROUTINE_TIMING },
  };
}

export function isValidWorkRoutineTiming(
  timing: WorkRoutineTiming,
): boolean {
  const values = [
    timing.departMinutesBefore,
    timing.arriveMinutesBefore,
    timing.handoverMinutesBefore,
  ];
  return (
    values.every(
      (value) =>
        Number.isInteger(value) &&
        value >= WORK_ROUTINE_MIN_MINUTES_BEFORE &&
        value <= WORK_ROUTINE_MAX_MINUTES_BEFORE &&
        value % WORK_ROUTINE_MINUTES_STEP === 0,
    ) &&
    timing.departMinutesBefore > timing.arriveMinutesBefore &&
    timing.arriveMinutesBefore > timing.handoverMinutesBefore
  );
}

export function resolveWorkRoutineKind(
  shift: Pick<ShiftType, 'id' | 'endsNextDay'>,
): keyof WorkRoutineProfiles {
  if (shift.id === 'day' || shift.id === 'substitute-day') return 'day';
  if (shift.id === 'night' || shift.id === 'substitute-night') return 'night';
  return shift.endsNextDay ? 'night' : 'day';
}

export function getWorkRoutineTimingForShift(
  profiles: Readonly<WorkRoutineProfiles>,
  shift: Pick<ShiftType, 'id' | 'endsNextDay'>,
): WorkRoutineTiming {
  return profiles[resolveWorkRoutineKind(shift)];
}
