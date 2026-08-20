import { describe, expect, it } from 'vitest';

import type { PatternVaultEntry } from '../../models/app-data';
import { createDefaultAppData } from '../../services/app-data-service';

import {
  buildPatternPreviewMonths,
  buildPatternDiffRows,
  buildPatternOverridePolicy,
  formatPatternCalendarShiftToken,
  formatPatternDayAccessibilityLabel,
  getPreservedOverrideDateKeys,
  resolvePatternPreviewRow,
  type PatternDiffRow,
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

function previewRow(
  dateKey: string,
  currentShiftTypeId: string,
  nextShiftTypeId: string,
): PatternDiffRow {
  return {
    dateKey,
    dateLabel: dateKey,
    currentShiftTypeId,
    currentLabel: currentShiftTypeId,
    currentTimeLabel: null,
    nextShiftTypeId,
    nextLabel: nextShiftTypeId,
    nextTimeLabel: null,
    changed: currentShiftTypeId !== nextShiftTypeId,
    scheduledShiftChanged: currentShiftTypeId !== nextShiftTypeId,
    hasDirectOverride: false,
  };
}

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

  it('groups only authoritative preview rows into calendar months', () => {
    const rows = [
      previewRow('2026-08-20', 'day', 'night'),
      previewRow('2026-09-01', 'night', 'off'),
      previewRow('2026-09-30', 'off', 'day'),
      previewRow('2026-10-01', 'day', 'day'),
    ];

    expect(buildPatternPreviewMonths(rows)).toEqual([
      { key: '2026-08', year: 2026, month: 7, label: '2026년 8월' },
      { key: '2026-09', year: 2026, month: 8, label: '2026년 9월' },
      { key: '2026-10', year: 2026, month: 9, label: '2026년 10월' },
    ]);
    expect(resolvePatternPreviewRow(rows, '2026-09-30')?.dateKey).toBe('2026-09-30');
    expect(resolvePatternPreviewRow(rows, null)?.dateKey).toBe('2026-08-20');
    expect(
      resolvePatternPreviewRow(rows, '2026-10-31', '2026-09')?.dateKey,
    ).toBe('2026-09-01');
    expect(
      resolvePatternPreviewRow(
        [previewRow('2026-08-20', 'day', 'day'), previewRow('2026-09-01', 'day', 'night')],
        null,
      )?.dateKey,
    ).toBe('2026-08-20');
  });

  it('uses compact shift tokens only for fixed-width calendar cells', () => {
    expect(formatPatternCalendarShiftToken('day', '주간')).toBe('주');
    expect(formatPatternCalendarShiftToken('substitute-night', '야간 대체근무')).toBe('야대');
    expect(formatPatternCalendarShiftToken('custom', '장시간근무')).toBe('장시');
    expect(formatPatternCalendarShiftToken(null, '일정 없음')).toBe('—');
  });
});
