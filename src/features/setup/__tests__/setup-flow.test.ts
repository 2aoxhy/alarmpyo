import { describe, expect, it } from 'vitest';

import {
  buildInitialSetupPayload,
  buildSetupPreview,
  normalizeSetupScreenStep,
  validateSetupInput,
} from '../setup-flow';

const rotationInput = {
  patternKind: 'rotation' as const,
  position: 0,
  referenceDate: '2026-07-13',
  dayStart: '07:00',
  dayEnd: '17:45',
  nightStart: '18:00',
  nightEnd: '06:45',
};

describe('첫 설정 흐름', () => {
  it('기존 3단계 초안을 새 두 번째 단계에서 이어서 열어요', () => {
    expect(normalizeSetupScreenStep(1)).toBe(1);
    expect(normalizeSetupScreenStep(2)).toBe(2);
    expect(normalizeSetupScreenStep(3)).toBe(2);
  });

  it('3조 2교대는 실제 근무 순서와 주간·야간 시간이 모두 있어야 완료해요', () => {
    expect(validateSetupInput({ ...rotationInput, position: null }).canComplete).toBe(false);
    expect(validateSetupInput(rotationInput).canComplete).toBe(true);
    expect(validateSetupInput({ ...rotationInput, nightEnd: '25:10' }).canComplete).toBe(false);
  });

  it('주간 고정은 요일에서 순서를 계산하고 야간 시간을 요구하지 않아요', () => {
    const validation = validateSetupInput({
      ...rotationInput,
      patternKind: 'weekday',
      position: null,
      nightStart: '',
      nightEnd: '',
    });

    expect(validation.activePosition).toBe(0);
    expect(validation.canComplete).toBe(true);
  });

  it('선택한 실제 근무부터 다음 반복 일정을 미리 보여줘요', () => {
    const preview = buildSetupPreview({
      activePosition: 2,
      patternKind: 'rotation',
      referenceDate: '2026-07-13',
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

  it('3조 2교대 완료 값에 기존 패턴과 근무 시간 계약을 그대로 담아요', () => {
    const validation = validateSetupInput(rotationInput);
    if (
      validation.activePosition === null ||
      validation.dayStartMinutes === null ||
      validation.dayEndMinutes === null ||
      !validation.dayDuration
    ) {
      throw new Error('테스트 입력이 올바르지 않아요.');
    }

    const payload = buildInitialSetupPayload({
      activePosition: validation.activePosition,
      alarmsWanted: true,
      dayDuration: validation.dayDuration,
      dayEndMinutes: validation.dayEndMinutes,
      dayStartMinutes: validation.dayStartMinutes,
      nightDuration: validation.nightDuration,
      nightEndMinutes: validation.nightEndMinutes,
      nightStartMinutes: validation.nightStartMinutes,
      patternKind: 'rotation',
      referenceDate: rotationInput.referenceDate,
    });

    expect(payload).toEqual({
      pattern: {
        name: '3조 2교대 (주주야야휴휴)',
        anchorDate: '2026-07-13',
        scheduleStartDate: '2026-07-13',
        shiftTypeIds: ['day', 'day', 'night', 'night', 'off', 'off'],
      },
      notificationsEnabled: true,
      shiftTypePatches: {
        day: { startMinutes: 420, endMinutes: 1065, endsNextDay: false },
        night: { startMinutes: 1080, endMinutes: 405, endsNextDay: true },
      },
    });
  });

  it('주간 고정 완료 값에는 사용자가 입력한 주간 시간을 저장해요', () => {
    const weekdayInput = {
      ...rotationInput,
      patternKind: 'weekday',
      position: null,
      dayStart: '08:10',
      dayEnd: '16:40',
    } as const;
    const validation = validateSetupInput(weekdayInput);
    if (
      validation.activePosition === null ||
      validation.dayStartMinutes === null ||
      validation.dayEndMinutes === null ||
      !validation.dayDuration
    ) {
      throw new Error('테스트 입력이 올바르지 않아요.');
    }

    const payload = buildInitialSetupPayload({
      activePosition: validation.activePosition,
      alarmsWanted: false,
      dayDuration: validation.dayDuration,
      dayEndMinutes: validation.dayEndMinutes,
      dayStartMinutes: validation.dayStartMinutes,
      nightDuration: validation.nightDuration,
      nightEndMinutes: validation.nightEndMinutes,
      nightStartMinutes: validation.nightStartMinutes,
      patternKind: 'weekday',
      referenceDate: weekdayInput.referenceDate,
    });

    expect(payload.notificationsEnabled).toBe(false);
    expect(payload.shiftTypePatches).toEqual({
      day: { startMinutes: 490, endMinutes: 1000, endsNextDay: false },
    });
    expect(payload.pattern.shiftTypeIds).toEqual([
      'day',
      'day',
      'day',
      'day',
      'day',
      'off',
      'off',
    ]);
  });
});
