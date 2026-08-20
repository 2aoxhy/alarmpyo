import type {
  AppData,
  DayAlarmOverride,
  DayExceptionType,
  DayTimeOverride,
  PayrollSettings,
  RotationPattern,
  ShiftType,
  ThemeMode,
  WidgetDisplayOptions,
  WorkRoutineProfiles,
} from '../models/app-data';
import {
  applyDayAlarmOverride,
  clearScheduleOverridesFrom,
  pruneInvalidDayAlarmOverrides,
  resolveBaseShiftFromAppData,
} from '../services/app-data-service';
import { canBuildWorkRoutinePlan } from '../services/work-routine-planner';

import {
  applyShiftTypePatch,
  areRotationPatternsEqual,
} from './app-data-mutations';

export type DayEditValues = {
  selection: string | null | 'pattern';
  note: string;
  timeOverride: Pick<DayTimeOverride, 'startMinutes' | 'endMinutes'> | null;
  dayException: DayExceptionType | null;
  /** undefined면 기존 값을 유지하고 null이면 날짜별 알람을 삭제해요. */
  alarmOverride?: DayAlarmOverride | null;
};

export type ShiftSettingsMutationResult = {
  data: AppData;
  compatible: boolean;
};

export type WidgetDisplayMutationResult = {
  data: AppData;
  validSelection: boolean;
};

export type PayrollSettingsMutationResult = {
  data: AppData;
  valid: boolean;
};

export function isValidDayTimeOverride(
  timeOverride: DayEditValues['timeOverride'],
): boolean {
  if (timeOverride === null) return true;
  return (
    Number.isInteger(timeOverride.startMinutes) &&
    timeOverride.startMinutes >= 0 &&
    timeOverride.startMinutes <= 1439 &&
    Number.isInteger(timeOverride.endMinutes) &&
    timeOverride.endMinutes >= 0 &&
    timeOverride.endMinutes <= 1439 &&
    timeOverride.startMinutes !== timeOverride.endMinutes
  );
}

export function hasOnlyKnownShiftTypeIds(
  shiftTypes: readonly ShiftType[],
  ids: Iterable<string>,
): boolean {
  const knownIds = new Set(shiftTypes.map((shift) => shift.id));
  for (const id of ids) {
    if (!knownIds.has(id)) return false;
  }
  return true;
}

/**
 * 하루 편집 화면에서 입력한 값만 반영해요. 저장과 알람 동기화는
 * Provider가 한 트랜잭션으로 처리할 수 있도록 이 함수 밖에 남겨 둬요.
 */
export function tryApplyDayEditValues(
  current: AppData,
  dateKey: string,
  values: DayEditValues,
): AppData | null {
  const overrides = { ...current.overrides };
  if (values.selection === 'pattern') delete overrides[dateKey];
  else overrides[dateKey] = values.selection;

  const timeOverrides = { ...current.timeOverrides };
  if (values.timeOverride) {
    const selectedShift = resolveBaseShiftFromAppData(
      { ...current, overrides, timeOverrides: {} },
      dateKey,
    );
    if (!selectedShift || selectedShift.isOff) return null;
    timeOverrides[dateKey] = {
      shiftTypeId: selectedShift.id,
      startMinutes: values.timeOverride.startMinutes,
      endMinutes: values.timeOverride.endMinutes,
      endsNextDay:
        values.timeOverride.endMinutes < values.timeOverride.startMinutes,
    };
  } else {
    delete timeOverrides[dateKey];
  }

  const notes = { ...current.notes };
  const trimmedNote = values.note.trim();
  if (trimmedNote) notes[dateKey] = trimmedNote;
  else delete notes[dateKey];

  const dayExceptions = { ...current.dayExceptions };
  if (values.dayException) dayExceptions[dateKey] = values.dayException;
  else delete dayExceptions[dateKey];

  const next: AppData = {
    ...current,
    overrides,
    timeOverrides,
    dayExceptions,
    notes,
  };
  if (values.alarmOverride !== undefined) {
    const withAlarmOverride = applyDayAlarmOverride(
      next,
      dateKey,
      values.alarmOverride,
    );
    if (!withAlarmOverride) return null;
    return pruneInvalidDayAlarmOverrides(withAlarmOverride);
  }
  return pruneInvalidDayAlarmOverrides(next);
}

/** 기존 순수 변환 호출은 거절된 편집에서 원본 참조를 유지해요. */
export function applyDayEditValues(
  current: AppData,
  dateKey: string,
  values: DayEditValues,
): AppData {
  return tryApplyDayEditValues(current, dateKey, values) ?? current;
}

export function applyPatternSettings(
  current: AppData,
  pattern: RotationPattern,
  shiftTypePatches: Record<string, Partial<ShiftType>>,
  clearFutureScheduleOverridesFrom?: string,
): AppData {
  const patternChanged = !areRotationPatternsEqual(current.pattern, pattern);
  const patchIds = new Set(Object.keys(shiftTypePatches));
  let shiftTypesChanged = false;
  const shiftTypes = current.shiftTypes.map((shift) => {
    if (!patchIds.has(shift.id)) return shift;
    const next = applyShiftTypePatch(shift, shiftTypePatches[shift.id] ?? {});
    if (next !== shift) shiftTypesChanged = true;
    return next;
  });

  const next =
    patternChanged || shiftTypesChanged
      ? {
          ...current,
          pattern,
          shiftTypes,
          appliedPatternSource: patternChanged
            ? ('legacy' as const)
            : current.appliedPatternSource,
          appliedPatternId: patternChanged ? null : current.appliedPatternId,
        }
      : current;
  const result = clearFutureScheduleOverridesFrom === undefined
    ? next
    : clearScheduleOverridesFrom(next, clearFutureScheduleOverridesFrom);
  return pruneInvalidDayAlarmOverrides(result);
}

export function applyShiftSettings(
  current: AppData,
  patches: Record<string, Partial<ShiftType>>,
  workRoutineProfiles?: WorkRoutineProfiles,
): ShiftSettingsMutationResult {
  const shiftTypeIds = new Set(Object.keys(patches));
  let changed = false;
  const shiftTypes = current.shiftTypes.map((shift) => {
    if (!shiftTypeIds.has(shift.id)) return shift;
    const next = applyShiftTypePatch(shift, patches[shift.id] ?? {});
    if (next !== shift) changed = true;
    return next;
  });
  const currentProfiles = current.settings.workRoutineProfiles;
  const nextProfiles = workRoutineProfiles ?? currentProfiles;
  const compatible = shiftTypes
    .filter((shift) =>
      ['day', 'evening', 'night', 'substitute-day', 'substitute-night'].includes(shift.id),
    )
    .every((shift) => canBuildWorkRoutinePlan(shift, nextProfiles));
  if (!compatible) return { data: current, compatible: false };

  const routineChanged = Boolean(
    workRoutineProfiles &&
      (currentProfiles.day.departMinutesBefore !==
        workRoutineProfiles.day.departMinutesBefore ||
        currentProfiles.day.arriveMinutesBefore !==
          workRoutineProfiles.day.arriveMinutesBefore ||
        currentProfiles.day.handoverMinutesBefore !==
          workRoutineProfiles.day.handoverMinutesBefore ||
        currentProfiles.evening.departMinutesBefore !==
          workRoutineProfiles.evening.departMinutesBefore ||
        currentProfiles.evening.arriveMinutesBefore !==
          workRoutineProfiles.evening.arriveMinutesBefore ||
        currentProfiles.evening.handoverMinutesBefore !==
          workRoutineProfiles.evening.handoverMinutesBefore ||
        currentProfiles.night.departMinutesBefore !==
          workRoutineProfiles.night.departMinutesBefore ||
        currentProfiles.night.arriveMinutesBefore !==
          workRoutineProfiles.night.arriveMinutesBefore ||
        currentProfiles.night.handoverMinutesBefore !==
          workRoutineProfiles.night.handoverMinutesBefore),
  );
  if (!changed && !routineChanged) return { data: current, compatible: true };

  return {
    compatible: true,
    data: pruneInvalidDayAlarmOverrides({
      ...current,
      shiftTypes,
      settings: routineChanged
        ? {
            ...current.settings,
            workRoutineProfiles: {
              day: { ...workRoutineProfiles!.day },
              evening: { ...workRoutineProfiles!.evening },
              night: { ...workRoutineProfiles!.night },
            },
          }
        : current.settings,
    }),
  };
}

export function applyThemeMode(current: AppData, _themeMode: ThemeMode): AppData {
  // Store 공개 계약은 이전 호출자를 위해 유지하지만 새 상태와 저장값은 항상 다크예요.
  if (current.settings.themeMode === 'dark') return current;
  return {
    ...current,
    settings: { ...current.settings, themeMode: 'dark' },
  };
}

export function isValidPayrollSettings(settings: PayrollSettings): boolean {
  return (
    Number.isInteger(settings.day) &&
    settings.day >= 1 &&
    settings.day <= 31 &&
    (settings.adjustment === 'fixed-date' ||
      settings.adjustment === 'previous-business-day')
  );
}

export function applyPayrollSettings(
  current: AppData,
  settings: PayrollSettings,
): PayrollSettingsMutationResult {
  if (!isValidPayrollSettings(settings)) {
    return { data: current, valid: false };
  }
  if (
    current.payrollSettings.day === settings.day &&
    current.payrollSettings.adjustment === settings.adjustment
  ) {
    return { data: current, valid: true };
  }
  return {
    valid: true,
    data: {
      ...current,
      payrollSettings: { ...settings },
    },
  };
}

export function applyDismissedUpdateVersionCode(
  current: AppData,
  versionCode: number,
): AppData | null {
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) return null;
  const previous = current.settings.dismissedUpdateVersionCode;
  if (previous !== null && previous >= versionCode) return current;
  return {
    ...current,
    settings: {
      ...current.settings,
      dismissedUpdateVersionCode: versionCode,
    },
  };
}

export function toggleWidgetDisplaySelection(
  current: AppData,
  option: keyof WidgetDisplayOptions,
): WidgetDisplayMutationResult {
  const previous = current.settings.widgetDisplayOptions;
  const selectedCount = Object.values(previous).filter(Boolean).length;
  if (previous[option] && selectedCount === 1) {
    return { data: current, validSelection: false };
  }
  return {
    validSelection: true,
    data: {
      ...current,
      settings: {
        ...current.settings,
        widgetDisplayOptions: {
          ...previous,
          [option]: !previous[option],
        },
      },
    },
  };
}

export function applySetupCompletion(
  current: AppData,
  pattern?: RotationPattern,
): AppData {
  return pruneInvalidDayAlarmOverrides({
    ...current,
    pattern: pattern ?? current.pattern,
    settings: { ...current.settings, setupCompleted: true },
  });
}

export function applyInitialSetupValues(
  current: AppData,
  input: {
    pattern: RotationPattern;
    notificationsEnabled: boolean;
    shiftTypePatches: Record<string, Partial<ShiftType>>;
  },
): AppData {
  return pruneInvalidDayAlarmOverrides({
    ...current,
    pattern: input.pattern,
    shiftTypes: current.shiftTypes.map((shift) => ({
      ...shift,
      ...(input.shiftTypePatches[shift.id] ?? {}),
    })),
    settings: {
      ...current.settings,
      notificationsEnabled: input.notificationsEnabled,
      setupCompleted: true,
    },
  });
}
