import {
  getPositionAfterReferenceDateChange,
  getWorkPatternCategoryId,
  getWorkPatternPreset,
  getWorkPatternPresetId,
  type BaseWorkShiftId,
  type WorkPatternCategoryId,
  type WorkPatternPresetId,
} from '../../utils/work-pattern';

import {
  activeShiftIds,
  createWorkPatternSummarySignature,
  type EditableWorkShiftId,
  type WorkPatternDraft,
  type WorkPatternTimeValues,
} from './work-pattern-draft';

export type WorkPatternEditorMode = 'initial' | 'edit';

export type WorkPatternEditorController = ReturnType<
  typeof createWorkPatternEditorController
>;

function invalidateSummary(
  current: WorkPatternDraft,
  patch: Partial<WorkPatternDraft>,
  disableAlarms = false,
): WorkPatternDraft {
  return {
    ...current,
    ...patch,
    ...(disableAlarms ? { alarmsWanted: false } : null),
    summaryConfirmation: null,
  };
}

/**
 * 최초 설정과 이후 편집이 같은 초안 변경 규칙을 사용하도록 묶습니다.
 * 저장과 권한 요청은 화면 책임으로 남겨 외부 계약을 바꾸지 않습니다.
 */
export function createWorkPatternEditorController(mode: WorkPatternEditorMode) {
  const disableAlarmsOnChange = mode === 'initial';

  return {
    mode,

    selectPreset(
      current: WorkPatternDraft,
      presetId: WorkPatternPresetId,
      options: { sequence?: readonly BaseWorkShiftId[]; times?: WorkPatternTimeValues } = {},
    ): WorkPatternDraft {
      const sequence = [
        ...(options.sequence ?? getWorkPatternPreset(presetId).shiftTypeIds),
      ];
      const eveningActivated =
        !current.sequence.includes('evening') && sequence.includes('evening');
      return invalidateSummary(
        current,
        {
          categoryId: getWorkPatternCategoryId(presetId),
          presetId,
          sequence,
          position: null,
          ...(options.times ? { times: options.times } : null),
          reviewedShiftIds: eveningActivated
            ? current.reviewedShiftIds.filter((id) => id !== 'evening')
            : current.reviewedShiftIds,
        },
        disableAlarmsOnChange,
      );
    },

    selectCategory(
      current: WorkPatternDraft,
      categoryId: WorkPatternCategoryId,
    ): WorkPatternDraft {
      return invalidateSummary(current, {
        categoryId,
        presetId: null,
        position: null,
      });
    },

    changeSequence(
      current: WorkPatternDraft,
      sequence: readonly BaseWorkShiftId[],
    ): WorkPatternDraft {
      const nextSequence = [...sequence];
      const eveningActivated =
        !current.sequence.includes('evening') && nextSequence.includes('evening');
      const presetId = getWorkPatternPresetId(nextSequence);
      return invalidateSummary(
        current,
        {
          categoryId: getWorkPatternCategoryId(presetId),
          presetId,
          position: null,
          sequence: nextSequence,
          reviewedShiftIds: eveningActivated
            ? current.reviewedShiftIds.filter((id) => id !== 'evening')
            : current.reviewedShiftIds,
        },
        disableAlarmsOnChange,
      );
    },

    changeTime(
      current: WorkPatternDraft,
      shiftTypeId: EditableWorkShiftId,
      field: 'start' | 'end',
      value: string,
    ): WorkPatternDraft {
      return invalidateSummary(
        current,
        {
          times: {
            ...current.times,
            [shiftTypeId]: {
              ...current.times[shiftTypeId],
              [field]: value,
            },
          },
        },
        disableAlarmsOnChange,
      );
    },

    changeReferenceDate(current: WorkPatternDraft, nextDate: string): WorkPatternDraft {
      return {
        ...current,
        position: getPositionAfterReferenceDateChange({
          currentDate: current.referenceDate,
          nextDate,
          selectedPosition: current.position,
        }),
        scheduleStartDate: nextDate,
        referenceDate: nextDate,
      };
    },

    confirmSummary(current: WorkPatternDraft): WorkPatternDraft {
      const reviewedShiftIds = [
        ...new Set([...current.reviewedShiftIds, ...activeShiftIds(current.sequence)]),
      ];
      const reviewed = { ...current, reviewedShiftIds };
      return {
        ...reviewed,
        summaryConfirmation: createWorkPatternSummarySignature(reviewed),
      };
    },
  };
}
