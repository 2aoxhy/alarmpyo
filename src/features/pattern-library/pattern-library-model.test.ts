import { describe, expect, it } from 'vitest';

import type { PatternVaultEntry } from '../../models/app-data';
import { createDefaultAppData } from '../../services/app-data-service';

import {
  buildPatternPreviewMonths,
  buildPatternDiffRows,
  buildPatternOverridePolicy,
  buildPatternSevenDaySummary,
  compressPatternShiftCodes,
  expandPatternComposerSegments,
  formatPatternApplyActionLabel,
  formatPatternCalendarShiftToken,
  formatPatternComposerName,
  formatPatternDayAccessibilityLabel,
  getPreservedOverrideDateKeys,
  getPatternComposerTotalDays,
  isPatternComposerValid,
  normalizePatternComposerSegments,
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
  it('losslessly compresses and expands consecutive composer segments', () => {
    const codes = [
      'DAY',
      'DAY',
      'NIGHT',
      'NIGHT',
      'OFF',
      'OFF',
    ] as const;
    const segments = compressPatternShiftCodes(codes);

    expect(segments).toEqual([
      { shiftCode: 'DAY', days: 2 },
      { shiftCode: 'NIGHT', days: 2 },
      { shiftCode: 'OFF', days: 2 },
    ]);
    expect(expandPatternComposerSegments(segments)).toEqual(codes);
    expect(getPatternComposerTotalDays(segments)).toBe(6);
    expect(formatPatternComposerName(segments)).toBe('주2일 · 야2일 · 휴2일');
    expect(
      normalizePatternComposerSegments([
        { shiftCode: 'DAY', days: 1 },
        { shiftCode: 'DAY', days: 2 },
        { shiftCode: 'OFF', days: 1 },
      ]),
    ).toEqual([
      { shiftCode: 'DAY', days: 3 },
      { shiftCode: 'OFF', days: 1 },
    ]);
  });

  it('accepts only composer segments totaling 1 through 42 days', () => {
    expect(isPatternComposerValid([{ shiftCode: 'DAY', days: 1 }])).toBe(true);
    expect(isPatternComposerValid([{ shiftCode: 'DAY', days: 42 }])).toBe(true);
    expect(isPatternComposerValid([])).toBe(false);
    expect(isPatternComposerValid([{ shiftCode: 'DAY', days: 0 }])).toBe(false);
    expect(isPatternComposerValid([{ shiftCode: 'DAY', days: 43 }])).toBe(false);
    expect(isPatternComposerValid([{ shiftCode: 'DAY', days: 1.5 }])).toBe(false);
  });

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

  it('builds the first seven day summary without changing the 42 day source', () => {
    const rows = Array.from({ length: 42 }, (_, index) => ({
      ...previewRow(`2026-08-${String(index + 1).padStart(2, '0')}`, 'day', 'night'),
      hasDirectOverride: index === 2,
    }));
    const summary = buildPatternSevenDaySummary({
      mode: 'preserve',
      rows,
      selectedDateKeys: new Set(),
    });

    expect(summary.rows).toHaveLength(7);
    expect(summary.rows[0]).toMatchObject(rows[0]);
    expect(summary.rows[6]).toMatchObject(rows[6]);
    expect(summary.changedDateCount).toBe(7);
    expect(summary.preservedOverrideDateCount).toBe(1);
    expect(summary.removedOverrideDateCount).toBe(0);
    expect(rows).toHaveLength(42);
  });

  it('describes the actual seven-day direct-edit result for every override policy', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      ...previewRow(`2026-08-${String(index + 20).padStart(2, '0')}`, 'day', 'night'),
      hasDirectOverride: index === 1 || index === 3 || index === 7,
    }));

    const preserve = buildPatternSevenDaySummary({
      mode: 'preserve',
      rows,
      selectedDateKeys: new Set(),
    });
    expect(preserve.rows.map((row) => row.directOverrideResolution)).toEqual([
      null,
      'preserve',
      null,
      'preserve',
      null,
      null,
      null,
    ]);
    expect(preserve.preservedOverrideDateCount).toBe(2);
    expect(preserve.removedOverrideDateCount).toBe(0);

    const removeAll = buildPatternSevenDaySummary({
      mode: 'remove-all',
      rows,
      selectedDateKeys: new Set(['2026-08-21']),
    });
    expect(removeAll.rows[1].directOverrideResolution).toBe('remove');
    expect(removeAll.rows[3].directOverrideResolution).toBe('remove');
    expect(removeAll.preservedOverrideDateCount).toBe(0);
    expect(removeAll.removedOverrideDateCount).toBe(2);

    const selective = buildPatternSevenDaySummary({
      mode: 'select',
      rows,
      selectedDateKeys: new Set(['2026-08-23', '2026-08-27']),
    });
    expect(selective.rows[1].directOverrideResolution).toBe('remove');
    expect(selective.rows[3].directOverrideResolution).toBe('preserve');
    expect(selective.preservedOverrideDateCount).toBe(1);
    expect(selective.removedOverrideDateCount).toBe(1);
  });

  it('uses an apply action label that reflects the preview result', () => {
    expect(
      formatPatternApplyActionLabel({
        changedDateCount: 7,
        clearedOverrideDateCount: 0,
      }),
    ).toBe('변경 7일 적용');
    expect(
      formatPatternApplyActionLabel({
        changedDateCount: 7,
        clearedOverrideDateCount: 2,
      }),
    ).toBe('직접 수정 2개 정리 후 적용');
    expect(
      formatPatternApplyActionLabel({
        changedDateCount: 0,
        clearedOverrideDateCount: 0,
      }),
    ).toBe('변경 없이 적용');
  });
});
