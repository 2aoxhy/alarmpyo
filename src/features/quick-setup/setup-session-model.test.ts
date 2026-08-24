import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../services/app-data-service';
import type { SetupDraft } from '../../services/setup-draft-service';
import type { QuickSetupDraftV1 } from './quick-setup-model';
import {
  createSetupReferenceDatePatch,
  createSetupSessionDraft,
  migrateInitialSetupDraft,
  migrateQuickSetupDraft,
  parseSetupSessionDraft,
} from './setup-session-model';

describe('통합 근무표 설정 세션', () => {
  it('최초 설정은 회사 유형 없이 근무표 선택 단계에서 시작합니다', () => {
    const data = createDefaultAppData('2026-08-24');
    const draft = createSetupSessionDraft({
      data,
      mode: 'initial',
      today: '2026-08-24',
    });

    expect(draft).toMatchObject({
      version: 2,
      mode: 'initial',
      source: null,
      step: 'schedule-source',
      presetId: null,
      position: null,
      alarmChoice: null,
    });
  });

  it('재설정은 현재 순서·시간·알람 상태를 초깃값으로 보존합니다', () => {
    const data = createDefaultAppData('2026-08-24');
    data.settings.notificationsEnabled = true;
    const draft = createSetupSessionDraft({
      data,
      mode: 'reconfigure',
      today: '2026-08-25',
    });

    expect(draft.presetId).toBe('three-team-two-shift');
    expect(draft.source).toBe('current');
    expect(draft.sequence).toEqual(['day', 'day', 'night', 'night', 'off', 'off']);
    expect(draft.alarmChoice).toBe('prepare');
    expect(draft.times.day.start).toMatch(/^\d{2}:\d{2}$/u);
  });

  it('간편 설정 V1은 저장 전 확인 단계의 V2로 승격합니다', () => {
    const data = createDefaultAppData('2026-08-24');
    const legacy: QuickSetupDraftV1 = {
      version: 1,
      source: 'direct',
      step: 'alarm-readiness',
      presetId: 'three-team-two-shift',
      sequence: ['day', 'day', 'night', 'night', 'off', 'off'],
      referenceDate: '2026-08-24',
      position: 1,
      receivedPreview: null,
    };

    expect(
      migrateQuickSetupDraft({ data, draft: legacy, mode: 'reconfigure' }),
    ).toMatchObject({
      version: 2,
      source: 'recommended',
      step: 'schedule-anchor',
      position: 1,
    });
  });

  it('선택 전 중단한 재설정은 다시 열 때 현재 근무표를 기본 선택합니다', () => {
    const data = createDefaultAppData('2026-08-24');
    const draft = {
      ...createSetupSessionDraft({
        data,
        mode: 'reconfigure' as const,
        today: '2026-08-24',
      }),
      source: null,
      presetId: null,
      position: null,
    };

    expect(
      migrateQuickSetupDraft({ data, draft, mode: 'reconfigure' }),
    ).toMatchObject({
      source: 'current',
      presetId: 'three-team-two-shift',
      position: 0,
    });
  });

  it('최초 설정 V1~V4 parser 결과를 시간 손실 없이 V2로 옮깁니다', () => {
    const data = createDefaultAppData('2026-08-24');
    const legacy: SetupDraft = {
      version: 4,
      step: 3,
      presetId: 'three-team-two-shift',
      sequence: ['day', 'day', 'night', 'night', 'off', 'off'],
      position: 1,
      referenceDate: '2026-08-24',
      dayStart: '06:40',
      dayEnd: '17:20',
      eveningStart: '14:30',
      eveningEnd: '22:30',
      nightStart: '17:20',
      nightEnd: '06:40',
      alarmsWanted: true,
      editedWorkTimeFields: ['dayStart'],
      confirmedSequenceSignature: null,
      confirmedWorkTimeSignature: null,
    };

    expect(migrateInitialSetupDraft({ data, draft: legacy })).toMatchObject({
      mode: 'initial',
      source: 'recommended',
      step: 'schedule-anchor',
      times: {
        day: { start: '06:40', end: '17:20' },
        night: { start: '17:20', end: '06:40' },
      },
      alarmChoice: 'prepare',
    });
  });

  it('손상된 V2와 범위를 벗어난 순번을 거부합니다', () => {
    const data = createDefaultAppData('2026-08-24');
    const draft = createSetupSessionDraft({
      data,
      mode: 'reconfigure',
      today: '2026-08-24',
    });

    expect(parseSetupSessionDraft(draft)).toEqual(draft);
    expect(parseSetupSessionDraft({ ...draft, position: 99 })).toBeNull();
    expect(parseSetupSessionDraft({ ...draft, times: { day: null } })).toBeNull();
    expect(
      parseSetupSessionDraft({
        ...draft,
        source: null,
        step: 'schedule-anchor',
      }),
    ).toBeNull();
  });

  it('직접 입력 중 partial·invalid 날짜는 세션 patch로 만들지 않습니다', () => {
    expect(
      createSetupReferenceDatePatch({
        presetId: 'three-team-two-shift',
        referenceDate: '2026-08',
      }),
    ).toBeNull();
    expect(
      createSetupReferenceDatePatch({
        presetId: 'three-team-two-shift',
        referenceDate: '2026-02-30',
      }),
    ).toBeNull();
    expect(
      createSetupReferenceDatePatch({
        presetId: 'three-team-two-shift',
        referenceDate: '2026-08-02',
      }),
    ).toEqual({
      referenceDate: '2026-08-02',
      position: null,
      alarmChoice: null,
      summaryConfirmation: null,
    });
  });

  it('주간 고정 날짜는 유효할 때만 해당 요일 순번과 함께 세션에 반영합니다', () => {
    expect(
      createSetupReferenceDatePatch({
        presetId: 'weekday',
        referenceDate: '2026-08-02',
      }),
    ).toMatchObject({ referenceDate: '2026-08-02', position: 6 });
  });
});
