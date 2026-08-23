import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../services/app-data-service';
import {
  createQuickPreview,
  createQuickSetupDraft,
  formatQuickPositionLabel,
  formatQuickSequence,
  QUICK_SETUP_OPTIONS,
  resolveQuickSetupShiftTimeRows,
} from './quick-setup-model';
import {
  exportWorkSettingsToJson,
  previewWorkSettingsImport,
} from '../../services/work-settings-share-service';

describe('근무표·알람 간편 설정 모델', () => {
  it('조 이름보다 실제 근무 순서를 먼저 보여 줍니다', () => {
    expect(QUICK_SETUP_OPTIONS.map((option) => option.label)).toEqual([
      '월~금 주간',
      '주간 → 야간',
      '주간 2일 → 야간 2일 → 휴무 2일',
      '주간 → 야간 → 휴무 2일',
      '주간 → 오후 → 야간',
      '주간 → 오후 → 야간 → 휴무',
    ]);
    expect(formatQuickSequence(['day', 'day', 'night', 'night', 'off', 'off']))
      .toBe('주간 → 주간 → 야간 → 야간 → 휴무 → 휴무');
  });

  it('같은 근무가 이어질 때 몇 일차인지 구분합니다', () => {
    const sequence = ['day', 'day', 'night', 'night', 'off', 'off'] as const;

    expect(formatQuickPositionLabel(sequence, 0)).toBe('주간 1일차');
    expect(formatQuickPositionLabel(sequence, 1)).toBe('주간 2일차');
    expect(formatQuickPositionLabel(sequence, 4)).toBe('휴무 1일차');
    expect(formatQuickPositionLabel(['day', 'night', 'off'], 1)).toBe('야간');
  });

  it('기준 날짜의 실제 순번에서 앞으로 7일을 계산합니다', () => {
    const preview = createQuickPreview(
      ['day', 'day', 'night', 'night', 'off', 'off'],
      '2026-08-24',
      1,
    );

    expect(preview.map((item) => [item.dateKey, item.shiftTypeId])).toEqual([
      ['2026-08-24', 'day'],
      ['2026-08-25', 'night'],
      ['2026-08-26', 'night'],
      ['2026-08-27', 'off'],
      ['2026-08-28', 'off'],
      ['2026-08-29', 'day'],
      ['2026-08-30', 'day'],
    ]);
  });

  it('중단된 설정을 현재 근무표의 오늘 순번에서 시작할 초안으로 만듭니다', () => {
    const data = createDefaultAppData('2026-08-24');
    const draft = createQuickSetupDraft(data, '2026-08-25');

    expect(draft).toMatchObject({
      version: 1,
      source: null,
      step: 'schedule-source',
      presetId: 'three-team-two-shift',
      referenceDate: '2026-08-25',
      position: 1,
    });
    expect(draft.sequence).toEqual(['day', 'day', 'night', 'night', 'off', 'off']);
  });

  it('잘못된 순번에는 미리보기를 만들지 않습니다', () => {
    expect(createQuickPreview(['day', 'night'], '2026-08-24', -1)).toEqual([]);
    expect(createQuickPreview(['day', 'night'], '2026-08-24', 2)).toEqual([]);
  });

  it('받은 파일을 적용하기 전에는 현재 값이 아니라 실제 적용될 근무 시간을 보여 줍니다', () => {
    const current = createDefaultAppData('2026-08-24');
    const source = createDefaultAppData('2026-08-24');
    source.shiftTypes.find((shift) => shift.id === 'day')!.startMinutes = 8 * 60 + 10;
    source.shiftTypes.find((shift) => shift.id === 'day')!.endMinutes = 18 * 60 + 20;
    const receivedPreview = previewWorkSettingsImport(
      exportWorkSettingsToJson(source),
    );
    const draft = {
      ...createQuickSetupDraft(current, '2026-08-24'),
      source: 'received-file' as const,
      receivedPreview,
    };

    expect(
      resolveQuickSetupShiftTimeRows(draft, current.shiftTypes).find(
        (shift) => shift.id === 'day',
      ),
    ).toMatchObject({ startMinutes: 8 * 60 + 10, endMinutes: 18 * 60 + 20 });
  });
});
