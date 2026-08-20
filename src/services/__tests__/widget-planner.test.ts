import { describe, expect, it } from 'vitest';

import { createDefaultAppData, resolveShiftFromAppData } from '../app-data-service';
import { buildAlarmPyoWidgetSnapshot, serializeAlarmPyoWidgetSnapshot } from '../widget-planner';

describe('buildAlarmPyoWidgetSnapshot', () => {
  it('날짜 변경 시 네이티브가 다시 계산할 수 있는 장기 근무 정보를 만들어요', () => {
    const data = createDefaultAppData('2026-07-13');
    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 10), horizonDays: 3 },
    );

    expect(snapshot.version).toBe(2);
    expect(snapshot.entries.map((entry) => entry.dateKey)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
    ]);
    expect(snapshot.entries).toHaveLength(3);
  });

  it('기존 근무표는 전날 야간 확인과 오늘부터 전체 계산 범위를 함께 보관해요', () => {
    const data = createDefaultAppData('2026-07-01');
    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 10), horizonDays: 3 },
    );

    expect(snapshot.entries.map((entry) => entry.dateKey)).toEqual([
      '2026-07-12',
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
    ]);
  });

  it('첫 근무일 이전을 휴무로 만들지 않고 첫 일정부터 전달합니다', () => {
    const data = createDefaultAppData('2026-07-15');
    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 10), horizonDays: 2 },
    );

    expect(snapshot.entries.map((entry) => entry.dateKey)).toEqual([
      '2026-07-15',
      '2026-07-16',
    ]);
    expect(snapshot.entries[0].shiftName).toBe('주간');
  });

  it('직접 변경과 시간 변경을 예외 일정으로 표시합니다', () => {
    const data = createDefaultAppData('2026-07-13');
    data.overrides['2026-07-13'] = 'night';
    data.timeOverrides['2026-07-13'] = {
      shiftTypeId: 'night',
      startMinutes: 19 * 60,
      endMinutes: 7 * 60,
      endsNextDay: true,
    };
    data.settings.notificationsEnabled = true;

    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 10), horizonDays: 1 },
    );

    expect(snapshot.entries[0]).toMatchObject({
      shiftTypeId: 'night',
      startMinutes: 19 * 60,
      endMinutes: 7 * 60,
      endsNextDay: true,
      isOverride: true,
    });
  });

  it('활동표와 무관한 근무 정보만 위젯 항목에 포함합니다', () => {
    const data = createDefaultAppData('2026-07-13');

    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 10), horizonDays: 3 },
    );

    expect(snapshot.entries.every((entry) => !('activityPlan' in entry))).toBe(true);
    const serialized = JSON.parse(serializeAlarmPyoWidgetSnapshot(snapshot));
    expect(
      serialized.entries.every(
        (entry: Record<string, unknown>) => !('activityPlan' in entry),
      ),
    ).toBe(true);
  });

  it('위젯 스냅샷을 버전과 설정 상태를 보존해 직렬화합니다', () => {
    const data = createDefaultAppData('2026-07-13');
    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 10), horizonDays: 2 },
    );

    expect(JSON.parse(serializeAlarmPyoWidgetSnapshot(snapshot))).toMatchObject({
      version: 2,
      setupCompleted: false,
      displayOptions: {
        todayShift: true,
        nextShift: true,
        nextAlarm: false,
      },
      alarms: [],
    });
  });

  it('선택한 다음 알람 정보를 네이티브 스냅샷에 함께 전달해요', () => {
    const data = createDefaultAppData('2026-07-13');
    data.settings.setupCompleted = true;
    data.settings.notificationsEnabled = true;
    data.settings.widgetDisplayOptions = {
      todayShift: false,
      nextShift: false,
      nextAlarm: true,
    };
    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 4), horizonDays: 3 },
    );

    expect(snapshot.displayOptions).toEqual(data.settings.widgetDisplayOptions);
    expect(snapshot.alarms[0]).toMatchObject({
      alarmAt: new Date(2026, 6, 13, 4, 55).getTime(),
      shiftTypeId: 'day',
      shiftName: '주간',
    });
  });

  it('연차와 교육 같은 예외 일정 이름을 위젯에 전달합니다', () => {
    const data = createDefaultAppData('2026-07-13');
    data.dayExceptions['2026-07-13'] = 'leave';
    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 10), horizonDays: 1 },
    );

    expect(snapshot.entries[0]).toMatchObject({
      isOverride: true,
      isOff: true,
      exceptionName: '연차',
    });
    expect('activityPlan' in snapshot.entries[0]).toBe(false);
  });

  it('예비군 근무와 예외 이름을 네이티브 위젯 JSON에 보존합니다', () => {
    const data = createDefaultAppData('2026-07-13');
    data.dayExceptions['2026-07-13'] = 'reserve';
    data.settings.notificationsEnabled = true;
    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 10), horizonDays: 1 },
    );

    const serialized = JSON.parse(serializeAlarmPyoWidgetSnapshot(snapshot));
    expect(serialized.entries[0]).toMatchObject({
      dateKey: '2026-07-13',
      shiftTypeId: 'exception-reserve',
      shiftName: '예비군',
      isOff: false,
      isOverride: true,
      exceptionName: '예비군',
    });
  });

  it('사용자 근무는 시간대와 무관하게 저장 강조색을 snapshot v2 시각 힌트로 전달해요', () => {
    const data = createDefaultAppData('2026-07-13');
    const base = data.shiftTypes.find((shift) => shift.id === 'day')!;
    data.shiftTypes.push(
      {
        ...base,
        id: 'custom-early',
        name: '맞춤 오전',
        shortName: '맞오',
        color: '#AABBCC',
        startMinutes: 6 * 60,
        endMinutes: 14 * 60,
        endsNextDay: false,
      },
      {
        ...base,
        id: 'custom-overnight',
        name: '맞춤 심야',
        shortName: '맞심',
        color: '#89CEFF',
        startMinutes: 22 * 60,
        endMinutes: 6 * 60,
        endsNextDay: true,
      },
    );
    data.pattern.shiftTypeIds = ['custom-early', 'custom-overnight'];
    data.settings.setupCompleted = true;
    data.settings.notificationsEnabled = true;
    data.settings.widgetDisplayOptions.nextAlarm = true;

    const snapshot = buildAlarmPyoWidgetSnapshot(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      { now: new Date(2026, 6, 13, 4), horizonDays: 2 },
    );
    const serialized = JSON.parse(serializeAlarmPyoWidgetSnapshot(snapshot));

    expect(serialized.version).toBe(2);
    expect(serialized.entries).toMatchObject([
      { shiftTypeId: 'custom-early', accentColor: '#AABBCC' },
      { shiftTypeId: 'custom-overnight', accentColor: '#89CEFF' },
    ]);
    expect(serialized.alarms[0]).toMatchObject({
      shiftTypeId: 'custom-early',
      accentColor: '#AABBCC',
    });
  });

  it('지나치게 큰 계산 범위를 거부합니다', () => {
    const data = createDefaultAppData('2026-07-13');
    expect(() =>
      buildAlarmPyoWidgetSnapshot(
        data,
        (dateKey) => resolveShiftFromAppData(data, dateKey),
        { now: new Date(2026, 6, 13), horizonDays: 367 },
      ),
    ).toThrow(RangeError);
  });
});
