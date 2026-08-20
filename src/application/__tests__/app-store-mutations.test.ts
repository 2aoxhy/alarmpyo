import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../services/app-data-service';

import {
  applyDismissedUpdateVersionCode,
  applyDayEditValues,
  applyInitialSetupValues,
  applyPatternSettings,
  applyPayrollSettings,
  applySetupCompletion,
  applyShiftSettings,
  applyThemeMode,
  hasOnlyKnownShiftTypeIds,
  isValidDayTimeOverride,
  tryApplyDayEditValues,
  toggleWidgetDisplaySelection,
} from '../app-store-mutations';

describe('app-store-mutations', () => {
  it('하루 시간 입력 범위를 확인해요', () => {
    expect(isValidDayTimeOverride(null)).toBe(true);
    expect(
      isValidDayTimeOverride({ startMinutes: 7 * 60, endMinutes: 18 * 60 }),
    ).toBe(true);
    expect(
      isValidDayTimeOverride({ startMinutes: 7 * 60, endMinutes: 7 * 60 }),
    ).toBe(false);
    expect(
      isValidDayTimeOverride({ startMinutes: -1, endMinutes: 18 * 60 }),
    ).toBe(false);
    expect(
      isValidDayTimeOverride({ startMinutes: 7 * 60, endMinutes: 1440 }),
    ).toBe(false);
  });

  it('하루 편집 값을 한 번에 반영해요', () => {
    const current = createDefaultAppData('2026-08-09');
    const next = applyDayEditValues(current, '2026-08-09', {
      selection: 'night',
      note: '  인수인계 확인  ',
      timeOverride: { startMinutes: 19 * 60, endMinutes: 6 * 60 },
      dayException: 'training',
    });

    expect(next.overrides['2026-08-09']).toBe('night');
    expect(next.notes['2026-08-09']).toBe('인수인계 확인');
    expect(next.dayExceptions['2026-08-09']).toBe('training');
    expect(next.timeOverrides['2026-08-09']).toMatchObject({
      shiftTypeId: 'night',
      startMinutes: 19 * 60,
      endMinutes: 6 * 60,
      endsNextDay: true,
    });
    expect(current.overrides['2026-08-09']).toBeUndefined();
  });

  it('휴무에는 시간 재정의를 만들지 않아요', () => {
    const current = createDefaultAppData('2026-08-09');
    const next = applyDayEditValues(current, '2026-08-09', {
      selection: 'off',
      note: '',
      timeOverride: { startMinutes: 7 * 60, endMinutes: 18 * 60 },
      dayException: null,
    });

    expect(next).toBe(current);
  });

  it('근무 편집과 날짜별 알람을 원자적으로 저장하고 휴무 전환에서 정리해요', () => {
    const current = createDefaultAppData('2026-08-09');
    const saved = tryApplyDayEditValues(current, '2026-08-09', {
      selection: 'pattern',
      note: '개별 기상',
      timeOverride: null,
      dayException: null,
      alarmOverride: { mode: 'wake-time', wakeMinutes: 5 * 60, wakeDayOffset: 0 },
    });

    expect(saved?.notes['2026-08-09']).toBe('개별 기상');
    expect(saved?.alarmOverrides['2026-08-09']).toEqual({
      mode: 'wake-time',
      wakeMinutes: 5 * 60,
      wakeDayOffset: 0,
    });

    const invalid = tryApplyDayEditValues(current, '2026-08-09', {
      selection: 'pattern',
      note: '저장되면 안 되는 메모',
      timeOverride: null,
      dayException: null,
      alarmOverride: { mode: 'wake-time', wakeMinutes: 8 * 60, wakeDayOffset: 0 },
    });
    expect(invalid).toBeNull();
    expect(current.notes['2026-08-09']).toBeUndefined();

    const leave = tryApplyDayEditValues(saved!, '2026-08-09', {
      selection: 'pattern',
      note: '',
      timeOverride: null,
      dayException: 'leave',
    });
    expect(leave?.alarmOverrides).toEqual({});
  });

  it('알려진 근무 ID만 허용해요', () => {
    const current = createDefaultAppData('2026-08-09');
    expect(
      hasOnlyKnownShiftTypeIds(current.shiftTypes, ['day', 'night']),
    ).toBe(true);
    expect(
      hasOnlyKnownShiftTypeIds(current.shiftTypes, ['day', 'unknown']),
    ).toBe(false);
  });

  it('근무 패턴과 근무 유형 패치를 함께 적용해요', () => {
    const current = createDefaultAppData('2026-08-09');
    const pattern = {
      ...current.pattern,
      anchorDate: '2026-08-10',
      scheduleStartDate: '2026-08-10',
    };
    const next = applyPatternSettings(
      current,
      pattern,
      { day: { alarmMinutesBefore: 90 } },
    );

    expect(next.pattern).toEqual(pattern);
    expect(
      next.shiftTypes.find((shift) => shift.id === 'day')?.alarmMinutesBefore,
    ).toBe(90);
    expect(applyPatternSettings(next, pattern, {})).toBe(next);
  });

  it('근무 시간과 준비 루틴을 호환될 때만 반영해요', () => {
    const current = createDefaultAppData('2026-08-09');
    const profiles = {
      day: {
        ...current.settings.workRoutineProfiles.day,
        departMinutesBefore:
          current.settings.workRoutineProfiles.day.departMinutesBefore + 5,
      },
      evening: { ...current.settings.workRoutineProfiles.evening },
      night: { ...current.settings.workRoutineProfiles.night },
    };
    const result = applyShiftSettings(
      current,
      { day: { alarmMinutesBefore: 100 } },
      profiles,
    );

    expect(result.compatible).toBe(true);
    expect(result.data.settings.workRoutineProfiles).toEqual(profiles);
    expect(
      result.data.shiftTypes.find((shift) => shift.id === 'day')
        ?.alarmMinutesBefore,
    ).toBe(100);
  });

  it('위젯에는 최소 한 가지 정보를 남겨요', () => {
    const current = createDefaultAppData('2026-08-09');
    const onlyToday = {
      ...current,
      settings: {
        ...current.settings,
        widgetDisplayOptions: {
          todayShift: true,
          nextShift: false,
          nextAlarm: false,
        },
      },
    };
    const rejected = toggleWidgetDisplaySelection(onlyToday, 'todayShift');
    expect(rejected.validSelection).toBe(false);
    expect(rejected.data).toBe(onlyToday);

    const accepted = toggleWidgetDisplaySelection(onlyToday, 'nextShift');
    expect(accepted.validSelection).toBe(true);
    expect(accepted.data.settings.widgetDisplayOptions.nextShift).toBe(true);
  });

  it('테마와 초기 설정을 불변 방식으로 반영해요', () => {
    const current = createDefaultAppData('2026-08-09');
    expect(applyThemeMode(current, current.settings.themeMode)).toBe(current);
    expect(applyThemeMode(current, 'light')).toBe(current);
    expect(applyThemeMode(current, 'system')).toBe(current);

    const legacyLight = {
      ...current,
      settings: { ...current.settings, themeMode: 'light' as const },
    };
    expect(applyThemeMode(legacyLight, 'system').settings.themeMode).toBe('dark');

    const completed = applySetupCompletion(current);
    expect(completed.settings.setupCompleted).toBe(true);
    const initialized = applyInitialSetupValues(current, {
      pattern: { ...current.pattern, anchorDate: '2026-08-10' },
      notificationsEnabled: true,
      shiftTypePatches: { day: { alarmMinutesBefore: 80 } },
    });
    expect(initialized.pattern.anchorDate).toBe('2026-08-10');
    expect(initialized.settings.notificationsEnabled).toBe(true);
    expect(initialized.settings.setupCompleted).toBe(true);
    expect(
      initialized.shiftTypes.find((shift) => shift.id === 'day')
        ?.alarmMinutesBefore,
    ).toBe(80);
  });

  it('급여일과 조정 정책만 유효한 범위에서 저장해요', () => {
    const current = createDefaultAppData('2026-08-15');
    const changed = applyPayrollSettings(current, {
      day: 31,
      adjustment: 'fixed-date',
    });
    expect(changed.valid).toBe(true);
    expect(changed.data.payrollSettings).toEqual({
      day: 31,
      adjustment: 'fixed-date',
    });
    expect(
      applyPayrollSettings(current, {
        day: 0,
        adjustment: 'fixed-date',
      }),
    ).toEqual({ data: current, valid: false });
  });

  it('닫은 업데이트 버전은 유효한 증가 값만 보존해요', () => {
    const current = createDefaultAppData('2026-08-15');
    const dismissed = applyDismissedUpdateVersionCode(current, 11)!;
    expect(dismissed.settings.dismissedUpdateVersionCode).toBe(11);
    expect(applyDismissedUpdateVersionCode(dismissed, 10)).toBe(dismissed);
    expect(applyDismissedUpdateVersionCode(dismissed, 0)).toBeNull();
  });
});
