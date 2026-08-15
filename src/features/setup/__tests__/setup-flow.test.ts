import { describe, expect, it } from 'vitest';

import {
  buildInitialSetupPayload,
  buildSetupPreview,
  applySetupPresetSuggestions,
  createSetupSequenceSignature,
  createSetupWorkTimeSignature,
  getSuggestedWorkTimesForPreset,
  normalizeSetupScreenStep,
  shouldApplySetupPresetSuggestion,
  validateSetupInput,
} from '../setup-flow';

const rotationInput = {
  presetId: 'three-team-two-shift' as const,
  sequence: ['day', 'day', 'night', 'night', 'off', 'off'] as const,
  position: 0,
  referenceDate: '2026-07-13',
  dayStart: '07:00',
  dayEnd: '19:00',
  eveningStart: '15:00',
  eveningEnd: '23:00',
  nightStart: '19:00',
  nightEnd: '07:00',
};

describe('initial setup flow', () => {
  it('keeps all three v3 setup screens', () => {
    expect(normalizeSetupScreenStep(1)).toBe(1);
    expect(normalizeSetupScreenStep(2)).toBe(2);
    expect(normalizeSetupScreenStep(3)).toBe(3);
  });

  it('provides non-overlapping representative hours for the first preset selection', () => {
    expect(getSuggestedWorkTimesForPreset('weekday')).toEqual({
      day: { start: '07:00', end: '16:00' },
    });
    expect(getSuggestedWorkTimesForPreset('four-team-two-shift')).toEqual({
      day: { start: '07:00', end: '19:00' },
      night: { start: '19:00', end: '07:00' },
    });
    expect(getSuggestedWorkTimesForPreset('three-team-three-shift')).toEqual({
      day: { start: '07:00', end: '15:00' },
      evening: { start: '15:00', end: '23:00' },
      night: { start: '23:00', end: '07:00' },
    });
    expect(getSuggestedWorkTimesForPreset('custom')).toBeNull();
  });

  it('updates suggestions across preset changes until a field is edited, then preserves input', () => {
    expect(
      shouldApplySetupPresetSuggestion({ resumedDraft: false, workTimesEdited: false }),
    ).toBe(true);
    expect(
      shouldApplySetupPresetSuggestion({ resumedDraft: false, workTimesEdited: true }),
    ).toBe(false);
    expect(
      shouldApplySetupPresetSuggestion({ resumedDraft: true, workTimesEdited: false }),
    ).toBe(false);

    const twoShift = getSuggestedWorkTimesForPreset('two-team-two-shift')!;
    const threeShift = getSuggestedWorkTimesForPreset('three-team-three-shift')!;
    expect(twoShift.day?.end).toBe('19:00');
    expect(threeShift).toEqual({
      day: { start: '07:00', end: '15:00' },
      evening: { start: '15:00', end: '23:00' },
      night: { start: '23:00', end: '07:00' },
    });
  });

  it('applies a new preset suggestion only to untouched time fields', () => {
    const values = {
      dayStart: '06:45',
      dayEnd: '17:45',
      eveningStart: '15:00',
      eveningEnd: '23:00',
      nightStart: '17:45',
      nightEnd: '06:45',
    };
    expect(
      applySetupPresetSuggestions({
        editedFields: ['dayStart'],
        suggestedTimes: getSuggestedWorkTimesForPreset('three-team-three-shift'),
        values,
      }),
    ).toEqual({
      dayStart: '06:45',
      dayEnd: '15:00',
      eveningStart: '15:00',
      eveningEnd: '23:00',
      nightStart: '23:00',
      nightEnd: '07:00',
    });
  });

  it('creates stable confirmation signatures from the visible sequence and active times', () => {
    const values = {
      dayStart: '07:00',
      dayEnd: '15:00',
      eveningStart: '15:00',
      eveningEnd: '23:00',
      nightStart: '23:00',
      nightEnd: '07:00',
    };
    expect(createSetupSequenceSignature(['day', 'evening', 'night'])).toBe(
      'sequence:v1:day,evening,night',
    );
    expect(
      createSetupWorkTimeSignature({ sequence: ['day', 'evening', 'night'], values }),
    ).toBe('times:v1:day:07:00-15:00|evening:15:00-23:00|night:23:00-07:00');
    expect(
      createSetupWorkTimeSignature({ sequence: ['day', 'off'], values }),
    ).toBe('times:v1:day:07:00-15:00');

    const confirmedSequence = createSetupSequenceSignature(['day', 'evening', 'night']);
    const confirmedTimes = createSetupWorkTimeSignature({
      sequence: ['day', 'evening', 'night'],
      values,
    });
    expect(createSetupSequenceSignature(['day', 'night', 'off'])).not.toBe(confirmedSequence);
    expect(
      createSetupWorkTimeSignature({
        sequence: ['day', 'evening', 'night'],
        values: { ...values, eveningStart: '14:30' },
      }),
    ).not.toBe(confirmedTimes);
  });

  it('requires a selected position and every active shift time', () => {
    expect(validateSetupInput({ ...rotationInput, position: null }).canComplete).toBe(false);
    expect(validateSetupInput(rotationInput).canComplete).toBe(true);

    const threeShiftInput = {
      ...rotationInput,
      presetId: 'three-team-three-shift' as const,
      sequence: ['day', 'evening', 'night'] as const,
      dayEnd: '15:00',
      nightStart: '23:00',
    };
    expect(validateSetupInput(threeShiftInput).canComplete).toBe(true);
    expect(validateSetupInput({ ...threeShiftInput, eveningEnd: '' }).canComplete).toBe(false);
  });

  it('derives weekday position and does not require inactive evening or night times', () => {
    const validation = validateSetupInput({
      ...rotationInput,
      presetId: 'weekday',
      sequence: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
      position: null,
      eveningStart: '',
      eveningEnd: '',
      nightStart: '',
      nightEnd: '',
    });

    expect(validation.activePosition).toBe(0);
    expect(validation.activeShiftIds).toEqual(['day']);
    expect(validation.canComplete).toBe(true);
  });

  it('converts an exact weekday custom sequence and ignores its anchor position', () => {
    const sequence = ['day', 'day', 'day', 'day', 'day', 'off', 'off'] as const;
    const input = {
      ...rotationInput,
      presetId: 'custom' as const,
      sequence,
      position: 2,
      referenceDate: '2026-07-18',
      eveningStart: '',
      eveningEnd: '',
      nightStart: '',
      nightEnd: '',
    };
    const validation = validateSetupInput(input);

    expect(validation).toMatchObject({
      effectivePresetId: 'weekday',
      normalizedToWeekday: true,
      activePosition: 5,
      canComplete: true,
    });
    expect(
      buildSetupPreview({
        activePosition: 2,
        presetId: 'custom',
        sequence,
        referenceDate: '2026-07-18',
      }).slice(0, 3).map((item) => item.shiftTypeId),
    ).toEqual(['off', 'off', 'day']);

    const payload = buildInitialSetupPayload({
      activePosition: validation.activePosition!,
      alarmsWanted: false,
      dayDuration: validation.dayDuration,
      dayEndMinutes: validation.dayEndMinutes,
      dayStartMinutes: validation.dayStartMinutes,
      eveningDuration: null,
      eveningEndMinutes: null,
      eveningStartMinutes: null,
      nightDuration: null,
      nightEndMinutes: null,
      nightStartMinutes: null,
      presetId: 'custom',
      sequence,
      referenceDate: input.referenceDate,
    });
    expect(payload.pattern).toMatchObject({
      name: '주간 고정',
      anchorDate: '2026-07-13',
      scheduleStartDate: '2026-07-18',
    });
  });

  it('previews one complete cycle starting from the actual selected position', () => {
    const preview = buildSetupPreview({
      activePosition: 2,
      presetId: rotationInput.presetId,
      sequence: rotationInput.sequence,
      referenceDate: rotationInput.referenceDate,
    });

    expect(preview.map((item) => item.shortName)).toEqual([
      '야1',
      '야2',
      '휴1',
      '휴2',
      '주1',
      '주2',
    ]);
    expect(preview.at(-1)?.dateKey).toBe('2026-07-18');
  });

  it('builds a three-shift payload with the dormant evening shift activated', () => {
    const input = {
      ...rotationInput,
      presetId: 'four-team-three-shift' as const,
      sequence: ['day', 'evening', 'night', 'off'] as const,
      dayEnd: '15:00',
      nightStart: '23:00',
    };
    const validation = validateSetupInput(input);
    if (validation.activePosition === null) throw new Error('invalid test position');

    const payload = buildInitialSetupPayload({
      activePosition: validation.activePosition,
      alarmsWanted: true,
      dayDuration: validation.dayDuration,
      dayEndMinutes: validation.dayEndMinutes,
      dayStartMinutes: validation.dayStartMinutes,
      eveningDuration: validation.eveningDuration,
      eveningEndMinutes: validation.eveningEndMinutes,
      eveningStartMinutes: validation.eveningStartMinutes,
      nightDuration: validation.nightDuration,
      nightEndMinutes: validation.nightEndMinutes,
      nightStartMinutes: validation.nightStartMinutes,
      presetId: input.presetId,
      sequence: input.sequence,
      referenceDate: input.referenceDate,
    });

    expect(payload.pattern).toEqual({
      name: '4조 3교대 (주오야휴)',
      anchorDate: '2026-07-13',
      scheduleStartDate: '2026-07-13',
      shiftTypeIds: ['day', 'evening', 'night', 'off'],
    });
    expect(payload.shiftTypePatches).toEqual({
      day: { startMinutes: 420, endMinutes: 900, endsNextDay: false },
      evening: { startMinutes: 900, endMinutes: 1380, endsNextDay: false },
      night: { startMinutes: 1380, endMinutes: 420, endsNextDay: true },
    });
  });

  it('blocks overlapping work and turns off an unsafe alarm opt-in defensively', () => {
    expect(() =>
      buildInitialSetupPayload({
        activePosition: 0,
        alarmsWanted: true,
        dayDuration: { durationMinutes: 660, endsNextDay: false },
        dayEndMinutes: 1065,
        dayStartMinutes: 405,
        eveningDuration: null,
        eveningEndMinutes: null,
        eveningStartMinutes: null,
        nightDuration: { durationMinutes: 780, endsNextDay: true },
        nightEndMinutes: 420,
        nightStartMinutes: 1065,
        presetId: 'two-team-two-shift',
        sequence: ['day', 'night'],
        referenceDate: '2026-07-13',
        safetyResult: {
          canEnableAlarms: false,
          canSave: false,
          issues: [{ code: 'work-overlap', sequenceIndex: 0, shiftTypeId: 'day' }],
        },
      }),
    ).toThrow('서로 겹치는 근무 시간을 먼저 수정해야 합니다.');

    const payload = buildInitialSetupPayload({
      activePosition: 0,
      alarmsWanted: true,
      dayDuration: { durationMinutes: 720, endsNextDay: false },
      dayEndMinutes: 1140,
      dayStartMinutes: 420,
      eveningDuration: null,
      eveningEndMinutes: null,
      eveningStartMinutes: null,
      nightDuration: { durationMinutes: 720, endsNextDay: true },
      nightEndMinutes: 420,
      nightStartMinutes: 1140,
      presetId: 'two-team-two-shift',
      sequence: ['day', 'night'],
      referenceDate: '2026-07-13',
      safetyResult: { canEnableAlarms: false, canSave: true, issues: [] },
    });
    expect(payload.notificationsEnabled).toBe(false);
  });

  it('keeps the legacy rotation call contract while callers migrate', () => {
    const validation = validateSetupInput({
      ...rotationInput,
      presetId: undefined,
      sequence: undefined,
      patternKind: 'rotation',
    });
    expect(validation.canComplete).toBe(true);
  });
});
