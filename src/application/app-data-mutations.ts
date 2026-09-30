import type {
  AppData,
  RotationPattern,
  ShiftType,
} from '../models/app-data';
import { arePatternExecutionsEqual } from '../utils/pattern-execution';

export { arePatternExecutionsEqual } from '../utils/pattern-execution';

/** 저장 계약을 바꾸지 않고 근무 패턴의 실질적인 변경 여부만 비교해요. */
export function areRotationPatternsEqual(
  left: RotationPattern,
  right: RotationPattern,
): boolean {
  return left.name === right.name && arePatternExecutionsEqual(left, right);
}

/** 정의된 값만 반영하고, 변경이 없으면 기존 참조를 그대로 유지해요. */
export function applyShiftTypePatch(
  shift: ShiftType,
  patch: Partial<ShiftType>,
): ShiftType {
  const definedEntries = Object.entries(patch).filter(
    ([key, value]) => key !== 'id' && value !== undefined,
  );
  if (
    definedEntries.length === 0 ||
    definedEntries.every(([key, value]) =>
      Object.is(shift[key as keyof ShiftType], value),
    )
  ) {
    return shift;
  }
  return { ...shift, ...Object.fromEntries(definedEntries) };
}

/** 네이티브 알람 동기화 결과만 갱신하고 근무 데이터는 건드리지 않아요. */
export function withAlarmRuntimeState(
  current: AppData,
  scheduledCount: number,
  lastSyncAt: string | null,
): AppData {
  if (
    current.settings.scheduledNotificationCount === scheduledCount &&
    current.settings.lastNotificationSyncAt === lastSyncAt
  ) {
    return current;
  }
  return {
    ...current,
    settings: {
      ...current.settings,
      scheduledNotificationCount: scheduledCount,
      lastNotificationSyncAt: lastSyncAt,
    },
  };
}
