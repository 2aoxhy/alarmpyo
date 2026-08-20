import { describe, expect, it } from 'vitest';

import type { PatternVaultEntry } from '../../models/app-data';
import { createDefaultAppData } from '../../services/app-data-service';

import {
  buildPatternDiffRows,
  buildPatternOverridePolicy,
  formatPatternDayAccessibilityLabel,
  getPreservedOverrideDateKeys,
  validatePatternDraft,
} from './pattern-library-model';

const pattern: PatternVaultEntry = {
  id: 'custom-pattern',
  source: 'user',
  name: '내 근무표',
  author: null,
  sourceVersion: 1,
  anchorDate: '2026-08-01',
  shiftCodes: ['DAY', 'NIGHT', 'OFF'],
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

describe('pattern library UI model', () => {
  it('accepts only named 1 through 42 day drafts', () => {
    expect(validatePatternDraft({ id: null, name: '', shiftCodes: ['DAY'] }).issue).toBe(
      'name-required',
    );
    expect(validatePatternDraft({ id: null, name: '패턴', shiftCodes: [] }).issue).toBe(
      'sequence-required',
    );
    expect(
      validatePatternDraft({
        id: null,
        name: '패턴',
        shiftCodes: Array.from({ length: 43 }, () => 'OFF' as const),
      }).issue,
    ).toBe('sequence-too-long');
    expect(
      validatePatternDraft({
        id: null,
        name: '패턴',
        shiftCodes: Array.from({ length: 42 }, () => 'OFF' as const),
      }).valid,
    ).toBe(true);
  });

  it('builds a fixed 42 day comparison without mutating time, alarm, or permission data', () => {
    const data = createDefaultAppData('2026-08-01');
    const alarmEnabled = data.shiftTypes.map((shift) => shift.alarmEnabled);
    const settings = structuredClone(data.settings);
    const rows = buildPatternDiffRows({ data, entry: pattern, startDate: '2026-08-20' });

    expect(rows).toHaveLength(42);
    expect(rows[0]).toMatchObject({ dateKey: '2026-08-20', nextShiftTypeId: 'night' });
    expect(data.shiftTypes.map((shift) => shift.alarmEnabled)).toEqual(alarmEnabled);
    expect(data.settings).toEqual(settings);
  });

  it('resolves preserve, remove all, and date selection independently', () => {
    const data = createDefaultAppData('2026-08-01');
    data.overrides['2026-08-20'] = 'night';
    data.timeOverrides['2026-08-21'] = {
      shiftTypeId: 'day',
      startMinutes: 420,
      endMinutes: 1_080,
      endsNextDay: false,
    };
    const rows = buildPatternDiffRows({ data, entry: pattern, startDate: '2026-08-20' });

    expect(
      getPreservedOverrideDateKeys({
        mode: 'preserve',
        rows,
        selectedDateKeys: new Set(),
      }),
    ).toEqual(['2026-08-20', '2026-08-21']);
    expect(
      getPreservedOverrideDateKeys({
        mode: 'remove-all',
        rows,
        selectedDateKeys: new Set(['2026-08-20']),
      }),
    ).toEqual([]);
    expect(
      getPreservedOverrideDateKeys({
        mode: 'select',
        rows,
        selectedDateKeys: new Set(['2026-08-21']),
      }),
    ).toEqual(['2026-08-21']);
  });

  it('inverts preserved UI dates into cleared Store selective dates', () => {
    expect(
      buildPatternOverridePolicy({
        directOverrideDateKeys: ['2026-08-20', '2026-08-21', '2026-08-22'],
        mode: 'select',
        preservedDateKeys: new Set(['2026-08-21']),
      }),
    ).toEqual({
      mode: 'selective',
      dateKeys: ['2026-08-20', '2026-08-22'],
    });
  });

  it('reads one checked state without duplicating the selected word', () => {
    const label = formatPatternDayAccessibilityLabel(11, 42, 'NIGHT');
    expect(label).toBe('12/42, 야간');
    expect(label).not.toContain('선택됨');
  });
});
