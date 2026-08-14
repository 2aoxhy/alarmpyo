import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../services/app-data-service';

import {
  buildWorkScheduleOverview,
  createShiftDrafts,
  formatAlarmOption,
  formatDraftWakeTimeSummary,
  formatShiftTimeSummary,
  formatWakeTimeSummary,
  getEditorSectionForDraftId,
  isShiftDraftValid,
} from './shift-settings-model';

describe('shift settings model', () => {
  it('기존 근무 타입을 저장 폼의 시간 초안으로 변환해요', () => {
    const data = createDefaultAppData('2026-08-09');
    const drafts = createShiftDrafts(data.shiftTypes);

    expect(drafts.find((draft) => draft.id === 'day')).toMatchObject({
      start: '06:45',
      alarmEnabled: true,
    });
    expect(drafts.some((draft) => draft.id === 'off')).toBe(false);
  });

  it('0700과 07:00 형식의 시간을 모두 검증해요', () => {
    expect(
      isShiftDraftValid({
        id: 'day',
        start: '0700',
        end: '18:00',
        alarmEnabled: true,
        alarmMinutesBefore: 110,
      }),
    ).toBe(true);
    expect(
      isShiftDraftValid({
        id: 'day',
        start: '07:00',
        end: '07:00',
        alarmEnabled: true,
        alarmMinutesBefore: 110,
      }),
    ).toBe(false);
  });

  it('대체근무를 하나의 편집 구역으로 분류해요', () => {
    expect(getEditorSectionForDraftId('day')).toBe('day');
    expect(getEditorSectionForDraftId('night')).toBe('night');
    expect(getEditorSectionForDraftId('substitute-night')).toBe('substitute');
  });

  it('근무 방식과 시작일을 유지한 미리 보기를 만들어요', () => {
    const data = createDefaultAppData('2026-08-09');
    const overview = buildWorkScheduleOverview(data, '2026-08-09');

    expect(overview.scheduleStartDate).toBe('2026-08-09');
    expect(overview.preview).toHaveLength(6);
    expect(overview.preview[0].dateKey).toBe('2026-08-09');
    expect(overview.referenceShiftLabel).toContain('첫째 날');
  });

  it('시간과 알람 구역의 요약 문구를 만들어요', () => {
    const data = createDefaultAppData('2026-08-09');

    expect(formatShiftTimeSummary(data.shiftTypes)).toContain('주간 06:45~17:45');
    expect(formatWakeTimeSummary(data.shiftTypes)).toBe('주간 04:55 · 야간 15:55');
    expect(formatWakeTimeSummary(data.shiftTypes, false)).toBe('주간 04:55');
    expect(formatDraftWakeTimeSummary(createShiftDrafts(data.shiftTypes))).toBe(
      '주간 04:55 · 야간 15:55',
    );
    expect(
      formatDraftWakeTimeSummary(
        createShiftDrafts(data.shiftTypes),
        false,
        true,
        false,
      ),
    ).toBe('오후 13:10');
    expect(formatAlarmOption(90)).toBe('90분 전');
    expect(formatAlarmOption(120)).toBe('2시간 전');
  });
});
