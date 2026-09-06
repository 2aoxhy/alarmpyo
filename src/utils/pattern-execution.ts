import type { RotationPattern } from '../models/app-data';

import { getWorkPatternKind } from './work-pattern';

function getEffectivePatternKind(
  pattern: Pick<RotationPattern, 'kind' | 'shiftTypeIds'>,
): 'rotation' | 'weekday' {
  return (
    pattern.kind ?? getWorkPatternKind(pattern.shiftTypeIds) ?? 'rotation'
  );
}

/** 이름과 관계없이 날짜별 근무를 계산하는 입력이 같은지 비교해요. */
export function arePatternExecutionsEqual(
  left: RotationPattern,
  right: RotationPattern,
): boolean {
  return (
    getEffectivePatternKind(left) === getEffectivePatternKind(right) &&
    left.anchorDate === right.anchorDate &&
    (left.scheduleStartDate ?? left.anchorDate) ===
      (right.scheduleStartDate ?? right.anchorDate) &&
    left.shiftTypeIds.length === right.shiftTypeIds.length &&
    left.shiftTypeIds.every((id, index) => id === right.shiftTypeIds[index])
  );
}
