import { describe, expect, it } from 'vitest';

import type { AppData, ShiftType } from '../../models/app-data';
import {
  ALARM_PLAN_HORIZON_DAYS,
  ALARM_PLAN_REFRESH_RECOMMENDED_DAYS,
  buildAlarmPyoAlarmPlan,
  buildAlarmPyoAlarmSyncMetadata,
  resolveAlarmPyoAlarmSourceShift,
  resolveAlarmPyoAlarmShift,
} from '../alarm-planner';
import {
  DEFAULT_WIDGET_DISPLAY_OPTIONS,
  resolveShiftFromAppData,
} from '../app-data-service';
import { createDefaultWorkRoutineProfiles } from '../work-routine-settings';

const DAY: ShiftType = {
  id: 'day',
  name: '주간',
  shortName: '주',
  color: '#000000',
  softColor: '#ffffff',
  startMinutes: 7 * 60,
  endMinutes: 18 * 60,
  endsNextDay: false,
  isOff: false,
  alarmEnabled: true,
  alarmMinutesBefore: 2 * 60,
};

const NIGHT: ShiftType = {
  ...DAY,
  id: 'night',
  name: '야간',
  shortName: '야',
  startMinutes: 18 * 60,
  endMinutes: 7 * 60,
  endsNextDay: true,
};

const OFF: ShiftType = {
  ...DAY,
  id: 'off',
  name: '휴무',
  shortName: '휴',
  startMinutes: null,
  endMinutes: null,
  isOff: true,
  alarmEnabled: false,
  alarmMinutesBefore: 0,
};

const SUBSTITUTE_DAY: ShiftType = {
  ...DAY,
  id: 'substitute-day',
  name: '주간 대체근무',
  shortName: '대주',
};

const SUBSTITUTE_NIGHT: ShiftType = {
  ...NIGHT,
  id: 'substitute-night',
  name: '야간 대체근무',
  shortName: '대야',
};

function makeData(alarmsEnabled = true): AppData {
  return {
    version: 19,
    shiftTypes: [DAY, NIGHT, SUBSTITUTE_DAY, SUBSTITUTE_NIGHT, OFF],
    pattern: {
      name: '3조 2교대 (주주야야휴휴)',
      anchorDate: '2026-07-11',
      scheduleStartDate: '2026-01-01',
      shiftTypeIds: ['day', 'day', 'night', 'night', 'off', 'off'],
    },
    overrides: {},
    timeOverrides: {},
    dayExceptions: {},
    alarmOverrides: {},
    notes: {},
    scheduleChangeHistory: [],
    settings: {
      notificationsEnabled: alarmsEnabled,
      sleepReminderEnabled: false,
      scheduledNotificationCount: 0,
      lastNotificationSyncAt: null,
      setupCompleted: true,
      themeMode: 'light',
      workRoutineProfiles: createDefaultWorkRoutineProfiles(),
      widgetDisplayOptions: { ...DEFAULT_WIDGET_DISPLAY_OPTIONS },
    },
  };
}

describe('ALARMPYO 알람 계획 계산', () => {
  it('알람 사용이 꺼졌으면 계획을 만들지 않아요', () => {
    const plan = buildAlarmPyoAlarmPlan(makeData(false), () => DAY, {
      now: new Date(2026, 6, 11, 0, 0),
    });

    expect(plan).toEqual([]);
  });

  it('첫 설정을 마치기 전에는 알람 사용 값이 켜져 있어도 계획을 비워요', () => {
    const data = makeData();
    data.settings.setupCompleted = false;

    const plan = buildAlarmPyoAlarmPlan(data, () => DAY, {
      now: new Date(2026, 6, 11, 0, 0),
      horizonDays: 1,
    });

    expect(plan).toEqual([]);
  });

  it('휴무와 이미 지난 알람을 제외하고 시간순으로 만들어요', () => {
    const shifts: Record<string, ShiftType> = {
      '2026-07-11': DAY,
      '2026-07-12': OFF,
      '2026-07-13': NIGHT,
    };
    const plan = buildAlarmPyoAlarmPlan(makeData(), (dateKey) => shifts[dateKey] ?? OFF, {
      now: new Date(2026, 6, 11, 6, 0),
      horizonDays: 3,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      dateKey: '2026-07-13',
      shiftTypeId: 'night',
      shiftName: '야간',
      alarmAt: new Date(2026, 6, 13, 16, 0).getTime(),
      startMinutes: 18 * 60,
      alarmMinutesBefore: 2 * 60,
    });
  });

  it('자동 점검은 가까운 알람 개수만 계산하고 이후 날짜를 읽지 않아요', () => {
    const resolvedDates: string[] = [];
    const plan = buildAlarmPyoAlarmPlan(makeData(), (dateKey) => {
      resolvedDates.push(dateKey);
      return DAY;
    }, {
      now: new Date(2026, 6, 11, 0, 0),
      horizonDays: 90,
      maxAlarms: 3,
    });

    expect(plan).toHaveLength(3);
    expect(plan.map((alarm) => alarm.dateKey)).toEqual([
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
    ]);
    expect(resolvedDates).toEqual([
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
    ]);
  });

  it('주간·야간·대체근무 설정에 맞춰 05시와 16시 알람을 만들어요', () => {
    const shifts: Record<string, ShiftType> = {
      '2026-07-11': SUBSTITUTE_DAY,
      '2026-07-12': SUBSTITUTE_NIGHT,
    };
    const plan = buildAlarmPyoAlarmPlan(makeData(), (dateKey) => shifts[dateKey] ?? OFF, {
      now: new Date(2026, 6, 11, 0, 0),
      horizonDays: 2,
    });

    expect(plan.map((item) => item.shiftTypeId)).toEqual(['substitute', 'substitute']);
    expect(plan.map((item) => item.shiftName)).toEqual([
      '주간 대체근무',
      '야간 대체근무',
    ]);
    expect(resolveAlarmPyoAlarmShift(makeData().shiftTypes, plan[0])).toBe(SUBSTITUTE_DAY);
    expect(resolveAlarmPyoAlarmShift(makeData().shiftTypes, plan[1])).toBe(SUBSTITUTE_NIGHT);
    expect(new Set(plan.map((item) => item.id)).size).toBe(2);
    expect(plan[0].alarmAt).toBe(new Date(2026, 6, 11, 5, 0).getTime());
    expect(plan[1].alarmAt).toBe(new Date(2026, 6, 12, 16, 0).getTime());
  });

  it('개인 출근 루틴을 적용하면 주간 05시 10분과 야간 16시 10분에 울립니다', () => {
    const routineDay = { ...DAY, alarmMinutesBefore: 110 };
    const routineNight = { ...NIGHT, alarmMinutesBefore: 110 };
    const shifts: Record<string, ShiftType> = {
      '2026-07-11': routineDay,
      '2026-07-12': routineNight,
    };
    const plan = buildAlarmPyoAlarmPlan(
      makeData(),
      (dateKey) => shifts[dateKey] ?? OFF,
      {
        now: new Date(2026, 6, 11, 0, 0),
        horizonDays: 2,
      },
    );

    expect(plan[0]).toMatchObject({
      alarmAt: new Date(2026, 6, 11, 5, 10).getTime(),
      alarmMinutesBefore: 110,
    });
    expect(plan[1]).toMatchObject({
      alarmAt: new Date(2026, 6, 12, 16, 10).getTime(),
      alarmMinutesBefore: 110,
    });
  });

  it('첫 근무일 이전에는 교육·예비군도 알람을 만들지 않아요', () => {
    const data = makeData();
    data.pattern.scheduleStartDate = '2026-07-13';
    data.dayExceptions['2026-07-12'] = 'training';

    expect(resolveAlarmPyoAlarmSourceShift(data, '2026-07-12', null)).toBeNull();

    const plan = buildAlarmPyoAlarmPlan(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 11, 0, 0), horizonDays: 3 },
    );

    expect(plan.map((item) => item.dateKey)).toEqual(['2026-07-13']);
  });

  it('네이티브 자동 보충을 위해 366일치 전체 계획을 전달해요', () => {
    const plan = buildAlarmPyoAlarmPlan(makeData(), () => DAY, {
      now: new Date(2026, 0, 1, 0, 0),
    });

    expect(plan).toHaveLength(ALARM_PLAN_HORIZON_DAYS);
    expect(plan[0].dateKey).toBe('2026-01-01');
    expect(plan.at(-1)?.dateKey).toBe('2027-01-01');
  });

  it('90일 권장 갱신과 366일 안전 종료 시각을 별도 메타데이터로 만들어요', () => {
    const now = new Date(2026, 0, 1, 12, 30);
    const metadata = buildAlarmPyoAlarmSyncMetadata(now);

    expect(metadata).toEqual({
      generatedAt: now.getTime(),
      refreshRecommendedAt: new Date(
        2026,
        0,
        1 + ALARM_PLAN_REFRESH_RECOMMENDED_DAYS,
        12,
        30,
      ).getTime(),
      safetyThroughAt: new Date(2026, 0, 1 + ALARM_PLAN_HORIZON_DAYS, 0, 0).getTime(),
    });
  });

  it('주간 고정은 주말을 건너뛰고 월요일 05시 알람부터 예약합니다', () => {
    const data = makeData();
    data.pattern = {
      name: '주간 고정',
      anchorDate: '2026-07-11',
      shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
    };

    const plan = buildAlarmPyoAlarmPlan(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      {
        now: new Date(2026, 6, 11, 0, 0),
        horizonDays: 3,
      },
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      dateKey: '2026-07-13',
      shiftTypeId: 'day',
      alarmAt: new Date(2026, 6, 13, 5, 0).getTime(),
    });
  });

  it('하루 시작 시간을 바꾸면 해당 날짜의 알람 시각과 식별자를 다시 계산합니다', () => {
    const original = makeData();
    const changed: AppData = {
      ...original,
      timeOverrides: {
        '2026-07-11': {
          shiftTypeId: 'day',
          startMinutes: 8 * 60 + 30,
          endMinutes: 19 * 60,
          endsNextDay: false,
        },
      },
    };
    const options = {
      now: new Date(2026, 6, 11, 0, 0),
      horizonDays: 1,
    };

    const originalPlan = buildAlarmPyoAlarmPlan(
      original,
      (dateKey) => resolveShiftFromAppData(original, dateKey),
      options,
    );
    const changedPlan = buildAlarmPyoAlarmPlan(
      changed,
      (dateKey) => resolveShiftFromAppData(changed, dateKey),
      options,
    );

    expect(originalPlan[0].alarmAt).toBe(new Date(2026, 6, 11, 5, 0).getTime());
    expect(changedPlan[0]).toMatchObject({
      dateKey: '2026-07-11',
      shiftTypeId: 'day',
      alarmAt: new Date(2026, 6, 11, 6, 30).getTime(),
      startMinutes: 8 * 60 + 30,
      alarmMinutesBefore: 2 * 60,
    });
    expect(changedPlan[0].id).not.toBe(originalPlan[0].id);
  });

  it('날짜별 고정 기상 시각은 해당 날짜의 근무 시간이 바뀌어도 유지해요', () => {
    const data = makeData();
    data.alarmOverrides['2026-07-11'] = {
      mode: 'wake-time',
      wakeMinutes: 5 * 60 + 10,
      wakeDayOffset: 0,
    };
    data.timeOverrides['2026-07-11'] = {
      shiftTypeId: 'day',
      startMinutes: 8 * 60 + 30,
      endMinutes: 19 * 60,
      endsNextDay: false,
    };

    const plan = buildAlarmPyoAlarmPlan(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 11, 0, 0), horizonDays: 1 },
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      alarmAt: new Date(2026, 6, 11, 5, 10).getTime(),
      startMinutes: 8 * 60 + 30,
      alarmMinutesBefore: 3 * 60 + 20,
    });
  });

  it('날짜별 알람 끄기는 전역 알람보다 우선하고 날짜별 기상은 전역 근무 알람을 켜요', () => {
    const data = makeData();
    data.alarmOverrides = {
      '2026-07-11': { mode: 'disabled' },
      '2026-07-12': { mode: 'wake-time', wakeMinutes: 5 * 60 + 20, wakeDayOffset: 0 },
    };
    data.shiftTypes = data.shiftTypes.map((shift) =>
      shift.id === 'day' ? { ...shift, alarmEnabled: false } : shift,
    );

    const plan = buildAlarmPyoAlarmPlan(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 11, 0, 0), horizonDays: 2 },
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      dateKey: '2026-07-12',
      alarmAt: new Date(2026, 6, 12, 5, 20).getTime(),
    });
  });

  it('휴무·연차는 저장된 날짜별 기상 알람보다 우선해요', () => {
    const data = makeData();
    data.dayExceptions['2026-07-11'] = 'leave';
    data.alarmOverrides['2026-07-11'] = {
      mode: 'wake-time',
      wakeMinutes: 5 * 60,
      wakeDayOffset: 0,
    };
    data.alarmOverrides['2026-07-15'] = {
      mode: 'wake-time',
      wakeMinutes: 5 * 60,
      wakeDayOffset: 0,
    };

    const plan = buildAlarmPyoAlarmPlan(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 11, 0, 0), horizonDays: 5 },
    );

    expect(plan.map((item) => item.dateKey)).not.toContain('2026-07-11');
    expect(plan.map((item) => item.dateKey)).not.toContain('2026-07-15');
  });

  it('연차 알람은 제외하고 교육일에는 날짜별 변경보다 주간 알람을 우선합니다', () => {
    const data = makeData();
    data.dayExceptions = {
      '2026-07-11': 'leave',
      '2026-07-12': 'training',
    };
    data.timeOverrides['2026-07-12'] = {
      shiftTypeId: 'day',
      startMinutes: 8 * 60 + 30,
      endMinutes: 20 * 60,
      endsNextDay: false,
    };

    const plan = buildAlarmPyoAlarmPlan(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 11, 0, 0), horizonDays: 2 },
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      dateKey: '2026-07-12',
      shiftTypeId: 'day',
      shiftName: '교육',
      alarmAt: new Date(2026, 6, 12, 5, 0).getTime(),
      startMinutes: 7 * 60,
      alarmMinutesBefore: 2 * 60,
    });
  });

  it('교육과 예비군 일정은 원래 야간이나 휴무여도 주간 기상 알람을 사용합니다', () => {
    const data = makeData();
    data.shiftTypes = data.shiftTypes.map((shift) =>
      shift.id === 'day'
        ? { ...shift, alarmMinutesBefore: 60 }
        : shift.id === 'night'
          ? { ...shift, alarmMinutesBefore: 3 * 60 }
          : shift,
    );
    data.dayExceptions = {
      '2026-07-13': 'training',
      '2026-07-15': 'reserve',
    };
    data.timeOverrides['2026-07-13'] = {
      shiftTypeId: 'night',
      startMinutes: 20 * 60,
      endMinutes: 8 * 60,
      endsNextDay: true,
    };

    const plan = buildAlarmPyoAlarmPlan(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 11, 0, 0), horizonDays: 5 },
    );
    const exceptionPlans = plan.filter(
      (item) => item.shiftName === '교육' || item.shiftName === '예비군',
    );

    expect(exceptionPlans).toHaveLength(2);
    expect(exceptionPlans).toEqual([
      expect.objectContaining({
        dateKey: '2026-07-13',
        shiftTypeId: 'day',
        shiftName: '교육',
        startMinutes: 7 * 60,
        alarmMinutesBefore: 60,
        alarmAt: new Date(2026, 6, 13, 6, 0).getTime(),
      }),
      expect.objectContaining({
        dateKey: '2026-07-15',
        shiftTypeId: 'day',
        shiftName: '예비군',
        startMinutes: 7 * 60,
        alarmMinutesBefore: 60,
        alarmAt: new Date(2026, 6, 15, 6, 0).getTime(),
      }),
    ]);
    expect(
      resolveAlarmPyoAlarmSourceShift(
        data,
        '2026-07-13',
        resolveShiftFromAppData(data, '2026-07-13'),
      ),
    ).toMatchObject({ id: 'day', name: '교육', startMinutes: 7 * 60 });
  });

  it('주간 기상 알람을 꺼 두면 교육일도 예약하지 않습니다', () => {
    const data = makeData();
    data.shiftTypes = data.shiftTypes.map((shift) =>
      shift.id === 'day' ? { ...shift, alarmEnabled: false } : shift,
    );
    data.dayExceptions['2026-07-13'] = 'training';

    const plan = buildAlarmPyoAlarmPlan(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 0, 0), horizonDays: 1 },
    );

    expect(plan).toEqual([]);
  });

  it('비정상 데이터에 주간 근무가 없으면 교육 알람을 안전하게 생략합니다', () => {
    const data = makeData();
    data.shiftTypes = data.shiftTypes.filter((shift) => shift.id !== 'day');
    data.dayExceptions['2026-07-13'] = 'training';

    expect(resolveAlarmPyoAlarmSourceShift(data, '2026-07-13', NIGHT)).toBeNull();
    expect(buildAlarmPyoAlarmPlan(data, () => NIGHT, {
      now: new Date(2026, 6, 13, 0, 0),
      horizonDays: 1,
    })).toEqual([]);
  });

  it('같은 일정은 네이티브 재사용이 가능한 동일한 식별자를 만들어요', () => {
    const options = {
      now: new Date(2026, 6, 11, 0, 0),
      horizonDays: 2,
    };
    const first = buildAlarmPyoAlarmPlan(makeData(), () => DAY, options);
    const second = buildAlarmPyoAlarmPlan(makeData(), () => DAY, options);

    expect(second).toEqual(first);
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
  });

  it('알람 직전에 앱을 실행해도 이미 예약된 미래 알람을 계획에 유지합니다', () => {
    const plan = buildAlarmPyoAlarmPlan(makeData(), () => DAY, {
      now: new Date(2026, 6, 11, 4, 59, 55),
      horizonDays: 1,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0].alarmAt).toBe(new Date(2026, 6, 11, 5, 0).getTime());
  });

  it('잘못된 준비 시간은 네이티브로 전달하지 않아요', () => {
    for (const alarmMinutesBefore of [-1, 1440]) {
      const invalid = { ...DAY, alarmMinutesBefore };
      expect(() =>
        buildAlarmPyoAlarmPlan(makeData(), () => invalid, {
          now: new Date(2026, 6, 11, 0, 0),
          horizonDays: 1,
        }),
      ).toThrow('준비 시간이 올바르지 않아요');
    }
  });
});
