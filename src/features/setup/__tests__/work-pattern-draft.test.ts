import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../../services/app-data-service';
import {
  getWorkPatternCategoryId,
  getWorkPatternPreset,
  WORK_PATTERN_PRESETS,
} from '../../../utils/work-pattern';
import {
  buildWorkPatternMutation,
  createExistingWorkPatternDraft,
  createInitialWorkPatternDraft,
  createWorkPatternSummarySignature,
  getFirstWorkPatternIssueTarget,
  getNewlyActiveShiftIds,
  restoreInitialWorkPatternDraft,
  resolveWorkPatternSaveOutcome,
  validateWorkPatternDraft,
  type WorkPatternDraft,
} from '../work-pattern-draft';

function confirmed<T extends WorkPatternDraft>(draft: T): T {
  return {
    ...draft,
    reviewedShiftIds: ['day', 'evening', 'night'],
    summaryConfirmation: createWorkPatternSummarySignature(draft),
  } as T;
}

function selectInitialPreset(
  presetId: (typeof WORK_PATTERN_PRESETS)[number]['id'],
): { data: ReturnType<typeof createDefaultAppData>; draft: WorkPatternDraft } {
  const data = createDefaultAppData('2026-08-15');
  const source = createInitialWorkPatternDraft({
    shiftTypes: data.shiftTypes,
    today: '2026-08-15',
  });
  const selected: WorkPatternDraft = {
    ...source,
    presetId,
    categoryId: getWorkPatternCategoryId(presetId),
    sequence: [...getWorkPatternPreset(presetId).shiftTypeIds],
    position: presetId === 'weekday' ? null : 0,
    times: {
      day: { start: '07:00', end: '15:00' },
      evening: { start: '15:00', end: '23:00' },
      night: { start: '23:00', end: '07:00' },
    },
  };
  return { data, draft: confirmed(selected) };
}

describe('work pattern draft', () => {
  it('builds the initial setup with the same draft and patches every active shift atomically', () => {
    const data = createDefaultAppData('2026-08-15');
    const source = createInitialWorkPatternDraft({ shiftTypes: data.shiftTypes, today: '2026-08-15' });
    const selected: WorkPatternDraft = {
      ...source,
      presetId: 'three-team-three-shift' as const,
      categoryId: 'three-shift' as const,
      sequence: ['day', 'evening', 'night'],
      position: 0,
      times: {
        day: { start: '07:00', end: '15:00' },
        evening: { start: '15:00', end: '23:00' },
        night: { start: '23:00', end: '07:00' },
      },
      reviewedShiftIds: ['day', 'evening', 'night'],
    };
    const draft: WorkPatternDraft = {
      ...selected,
      summaryConfirmation: createWorkPatternSummarySignature(selected),
    };
    expect(buildWorkPatternMutation(draft, data.shiftTypes).shiftTypePatches).toMatchObject({
      day: { startMinutes: 420, endMinutes: 900 },
      evening: { startMinutes: 900, endMinutes: 1380 },
      night: { startMinutes: 1380, endMinutes: 420 },
    });
  });

  it.each(WORK_PATTERN_PRESETS.map((preset) => preset.id))(
    'builds the %s preset through the shared initial draft',
    (presetId) => {
      const { data, draft } = selectInitialPreset(presetId);
      const mutation = buildWorkPatternMutation(draft, data.shiftTypes);
      expect(mutation.pattern.shiftTypeIds).toEqual(getWorkPatternPreset(presetId).shiftTypeIds);
      expect(mutation.shiftTypePatches).toHaveProperty('day');
    },
  );

  it.each([1, 8, 42])('validates a %i-day custom sequence during initial setup', (length) => {
    const data = createDefaultAppData('2026-08-15');
    const source = createInitialWorkPatternDraft({ shiftTypes: data.shiftTypes, today: '2026-08-15' });
    const sequence = Array.from({ length }, (_, index) => index === 0 ? 'day' as const : 'off' as const);
    const draft = confirmed({
      ...source,
      presetId: 'custom',
      categoryId: 'custom',
      sequence,
      position: 0,
    });
    expect(validateWorkPatternDraft(draft, data.shiftTypes).canSave).toBe(true);
    expect(buildWorkPatternMutation(draft, data.shiftTypes).pattern.shiftTypeIds).toHaveLength(length);
  });

  it('restores a confirmed v4 setup snapshot into the shared draft without changing its storage shape', () => {
    const data = createDefaultAppData('2026-08-15');
    const base = createInitialWorkPatternDraft({ shiftTypes: data.shiftTypes, today: '2026-08-15' });
    const selected = confirmed({
      ...base,
      presetId: 'three-team-two-shift' as const,
      categoryId: 'two-shift' as const,
      position: 2,
    });
    const restored = restoreInitialWorkPatternDraft(base, {
      presetId: selected.presetId,
      sequence: selected.sequence,
      position: selected.position,
      referenceDate: selected.referenceDate,
      dayStart: selected.times.day.start,
      dayEnd: selected.times.day.end,
      eveningStart: selected.times.evening.start,
      eveningEnd: selected.times.evening.end,
      nightStart: selected.times.night.start,
      nightEnd: selected.times.night.end,
      alarmsWanted: true,
      confirmedSequenceSignature: selected.summaryConfirmation,
      confirmedWorkTimeSignature: selected.summaryConfirmation,
    });

    expect(restored.summaryConfirmation).toBe(createWorkPatternSummarySignature(restored));
    expect(restored.reviewedShiftIds).toEqual(['day', 'night']);
    expect(restored.scheduleStartDate).toBe(selected.referenceDate);
    expect(restored.alarmsWanted).toBe(true);
  });

  it('requires evening review before an initial 2-to-3 shift change can be saved atomically', () => {
    const { data, draft: twoShift } = selectInitialPreset('two-team-two-shift');
    const changed: WorkPatternDraft = {
      ...twoShift,
      presetId: 'three-team-three-shift',
      categoryId: 'three-shift',
      sequence: ['day', 'evening', 'night'],
      reviewedShiftIds: twoShift.reviewedShiftIds.filter((id) => id !== 'evening'),
      summaryConfirmation: null,
    };
    expect(validateWorkPatternDraft(changed, data.shiftTypes).issues).toContainEqual({
      code: 'new-shift-review-required',
      shiftTypeId: 'evening',
    });

    const reviewed = confirmed(changed);
    const mutation = buildWorkPatternMutation(reviewed, data.shiftTypes);
    expect(mutation.pattern.shiftTypeIds).toEqual(['day', 'evening', 'night']);
    expect(mutation.shiftTypePatches).toMatchObject({
      day: { startMinutes: 420, endMinutes: 900 },
      evening: { startMinutes: 900, endMinutes: 1380 },
      night: { startMinutes: 1380, endMinutes: 420 },
    });
  });

  it('preserves stored times when only the start date changes', () => {
    const data = createDefaultAppData('2026-08-15');
    const source = createExistingWorkPatternDraft({ data, today: '2026-08-15' });
    const draft = confirmed({
      ...source,
      scheduleStartDate: '2026-08-18',
      referenceDate: '2026-08-18',
      position: 0,
    });
    const mutation = buildWorkPatternMutation(draft, data.shiftTypes);

    expect(mutation.shiftTypePatches).toEqual({});
    expect(mutation.pattern.scheduleStartDate).toBe('2026-08-18');
  });

  it('requires the newly active evening shift to be reviewed', () => {
    const data = createDefaultAppData('2026-08-15');
    const source = createExistingWorkPatternDraft({ data, today: '2026-08-15' });
    const changed: WorkPatternDraft = {
      ...source,
      presetId: 'three-team-three-shift' as const,
      categoryId: 'three-shift' as const,
      sequence: ['day', 'evening', 'night'],
      position: 0,
      times: {
        ...source.times,
        day: { start: '07:00', end: '15:00' },
        evening: { start: '15:00', end: '23:00' },
        night: { start: '23:00', end: '07:00' },
      },
      reviewedShiftIds: source.reviewedShiftIds.filter((id) => id !== 'evening'),
      summaryConfirmation: null,
    };

    expect(getNewlyActiveShiftIds(changed)).toEqual(['evening']);
    expect(validateWorkPatternDraft(changed, data.shiftTypes).issues).toContainEqual({
      code: 'new-shift-review-required',
      shiftTypeId: 'evening',
    });

    const reviewed = confirmed({ ...changed, reviewedShiftIds: ['day', 'evening', 'night'] });
    const mutation = buildWorkPatternMutation(reviewed, data.shiftTypes);
    expect(mutation.pattern.shiftTypeIds).toEqual(['day', 'evening', 'night']);
    expect(mutation.shiftTypePatches).toMatchObject({
      day: { startMinutes: 420, endMinutes: 900 },
      evening: { startMinutes: 900, endMinutes: 1380 },
      night: { startMinutes: 1380, endMinutes: 420 },
    });
  });

  it('preserves legacy evening IDs until their mapping is explicitly confirmed', () => {
    const data = createDefaultAppData('2026-08-15');
    data.pattern.shiftTypeIds = ['legacy-evening-2', 'off'];
    data.pattern.name = '기존 교대';
    const source = createExistingWorkPatternDraft({ data, today: '2026-08-15' });

    const unchanged = confirmed(source);
    expect(buildWorkPatternMutation(unchanged, data.shiftTypes).pattern.shiftTypeIds).toEqual([
      'legacy-evening-2',
      'off',
    ]);

    const changed = confirmed({
      ...source,
      presetId: 'three-team-three-shift',
      categoryId: 'three-shift',
      sequence: ['day', 'evening', 'night'],
      position: 0,
    });
    expect(validateWorkPatternDraft(changed, data.shiftTypes).issues).toContainEqual({
      code: 'legacy-mapping-required',
    });
    expect(() => buildWorkPatternMutation(changed, data.shiftTypes)).toThrow();

    const mapped = confirmed({ ...changed, legacyMappingConfirmed: true });
    expect(buildWorkPatternMutation(mapped, data.shiftTypes).pattern.shiftTypeIds).toEqual([
      'day',
      'evening',
      'night',
    ]);
  });

  it('blocks overlapping initial times before building an atomic pattern and time mutation', () => {
    const data = createDefaultAppData('2026-08-15');
    const source = createInitialWorkPatternDraft({ shiftTypes: data.shiftTypes, today: '2026-08-15' });
    const overlapping = confirmed({
      ...source,
      presetId: 'two-team-two-shift',
      categoryId: 'two-shift',
      sequence: ['night', 'day'],
      position: 0,
      times: {
        ...source.times,
        day: { start: '07:00', end: '19:00' },
        night: { start: '19:00', end: '10:00' },
      },
    });
    const validation = validateWorkPatternDraft(overlapping, data.shiftTypes);
    expect(validation.canSave).toBe(false);
    expect(validation.issues).toContainEqual({ code: 'work-overlap' });
    expect(() => buildWorkPatternMutation(overlapping, data.shiftTypes)).toThrow();
    expect(getFirstWorkPatternIssueTarget(validation)).toEqual({
      step: 2,
      editor: 'times',
      shiftTypeId: 'day',
    });
  });

  it('routes all-off and invalid-time setup errors to the first actionable editor', () => {
    const { data, draft } = selectInitialPreset('custom');
    const allOff = confirmed({
      ...draft,
      sequence: ['off'],
      position: 0,
    });
    expect(getFirstWorkPatternIssueTarget(validateWorkPatternDraft(allOff, data.shiftTypes))).toEqual({
      step: 2,
      editor: 'sequence',
      shiftTypeId: null,
    });

    const invalidEvening = confirmed({
      ...draft,
      presetId: 'three-team-three-shift',
      categoryId: 'three-shift',
      sequence: ['day', 'evening', 'night'],
      times: { ...draft.times, evening: { start: '', end: '23:00' } },
    });
    expect(
      getFirstWorkPatternIssueTarget(validateWorkPatternDraft(invalidEvening, data.shiftTypes)),
    ).toEqual({ step: 2, editor: 'times', shiftTypeId: 'evening' });
  });

  it('distinguishes validation, backup, storage, alarm opt-out, and alarm sync outcomes', () => {
    const base = { alarmsWanted: true, alarmsReady: true, backupCreated: true, persisted: true, valid: true };
    expect(resolveWorkPatternSaveOutcome({ ...base, valid: false })).toEqual({
      status: 'failure', issue: 'invalid-schedule',
    });
    expect(resolveWorkPatternSaveOutcome({ ...base, backupCreated: false })).toEqual({
      status: 'failure', issue: 'backup-failure',
    });
    expect(resolveWorkPatternSaveOutcome({ ...base, persisted: false })).toEqual({
      status: 'failure', issue: 'storage-failure',
    });
    expect(resolveWorkPatternSaveOutcome({ ...base, alarmsWanted: false })).toEqual({
      status: 'success', issue: null,
    });
    expect(resolveWorkPatternSaveOutcome({
      ...base,
      alarmsWanted: false,
      alarmSyncFailed: true,
    })).toEqual({
      status: 'partial', issue: 'alarm-sync-partial',
    });
    expect(resolveWorkPatternSaveOutcome({ ...base, alarmsReady: false })).toEqual({
      status: 'partial', issue: 'alarms-disabled',
    });
    expect(resolveWorkPatternSaveOutcome({ ...base, alarmsReady: false, alarmSyncFailed: true })).toEqual({
      status: 'partial', issue: 'alarm-sync-partial',
    });
  });
});
