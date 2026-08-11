import { describe, expect, it } from 'vitest';

import type { AppData } from '../../models/app-data';
import { addDays, dateAtMinutes } from '../../utils/date';
import {
  createDefaultAppData,
  resolveShiftFromAppData,
} from '../app-data-service';
import {
  buildSleepTimingGuidance,
  type SleepTimingWindow,
} from '../sleep-timing-planner';

function appData() {
  const data = createDefaultAppData('2026-07-11');
  data.settings.setupCompleted = true;
  data.shiftTypes = data.shiftTypes.map((shift) =>
    shift.isOff ? shift : { ...shift, alarmMinutesBefore: 110 },
  );
  return data;
}

function at(dateKey: string, hours: number, minutes = 0): number {
  return dateAtMinutes(dateKey, hours * 60 + minutes).getTime();
}

function allWindows(
  guidance: ReturnType<typeof buildSleepTimingGuidance>,
): SleepTimingWindow[] {
  return [guidance.primary, ...guidance.additional];
}

function expectNoWorkOverlap(
  data: AppData,
  guidance: ReturnType<typeof buildSleepTimingGuidance>,
  firstDateKey: string,
  dayCount: number,
): void {
  const workIntervals = Array.from({ length: dayCount }, (_, offset) => {
    const dateKey = addDays(firstDateKey, offset);
    const shift = resolveShiftFromAppData(data, dateKey);
    if (
      !shift ||
      shift.isOff ||
      shift.startMinutes === null ||
      shift.endMinutes === null
    ) {
      return null;
    }
    const endDateKey = shift.endsNextDay ? addDays(dateKey, 1) : dateKey;
    return {
      startAt: dateAtMinutes(dateKey, shift.startMinutes).getTime(),
      endAt: dateAtMinutes(endDateKey, shift.endMinutes).getTime(),
    };
  }).filter(
    (interval): interval is { startAt: number; endAt: number } =>
      interval !== null,
  );

  allWindows(guidance).forEach((window) => {
    workIntervals.forEach((work) => {
      const overlap =
        Math.min(window.endAt, work.endAt) -
        Math.max(window.startAt, work.startAt);
      expect(overlap, `${window.title}이 근무 시간과 겹쳐요.`).toBeLessThanOrEqual(0);
    });
  });
}

describe('buildSleepTimingGuidance', () => {
  it('주간 근무 전 기상 목표까지 8시간 수면 창을 만들어요', () => {
    const guidance = buildSleepTimingGuidance(appData(), {
      now: new Date(2026, 6, 10, 12),
      additionalLimit: 5,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'main',
      relatedDateKey: '2026-07-11',
      shiftTypeId: 'day',
      startAt: at('2026-07-10', 21, 10),
      endAt: at('2026-07-11', 5, 10),
      bedtimeRangeStartAt: at('2026-07-10', 20, 40),
      bedtimeRangeEndAt: at('2026-07-10', 22, 10),
      usesFallbackAlarmLead: false,
    });
    expect(guidance.transitionMode).toMatchObject({
      kind: 'off-to-day',
      title: '휴무 → 주간 전환',
    });
    expect(guidance.transitionMode?.windowIds).toContain(guidance.primary.id);
    expect(guidance.additional.every((window) => window.kind !== 'regular')).toBe(true);
  });

  it('변경한 근무 알람 시각을 수면 종료에도 동일하게 사용합니다', () => {
    const data = appData();
    const day = data.shiftTypes.find((shift) => shift.id === 'day')!;
    day.alarmMinutesBefore = 120;

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 10, 12),
    });

    expect(guidance.primary).toMatchObject({
      kind: 'main',
      startAt: at('2026-07-10', 21),
      endAt: at('2026-07-11', 5),
      usesFallbackAlarmLead: false,
    });
  });

  it('날짜별 고정 기상 시각을 수면 종료 기준으로 사용해요', () => {
    const data = appData();
    data.alarmOverrides['2026-07-11'] = {
      mode: 'wake-time',
      wakeMinutes: 4 * 60 + 50,
      wakeDayOffset: 0,
    };
    data.timeOverrides['2026-07-11'] = {
      shiftTypeId: 'day',
      startMinutes: 8 * 60 + 30,
      endMinutes: 19 * 60,
      endsNextDay: false,
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 10, 12),
    });

    expect(guidance.primary).toMatchObject({
      kind: 'main',
      relatedDateKey: '2026-07-11',
      startAt: at('2026-07-10', 20, 50),
      endAt: at('2026-07-11', 4, 50),
      usesFallbackAlarmLead: false,
    });
  });

  it('첫 야간은 이전 주간 리듬의 핵심 수면과 90분 보충 수면을 만들어요', () => {
    const guidance = buildSleepTimingGuidance(appData(), {
      now: new Date(2026, 6, 12, 19),
      additionalLimit: 8,
    });
    const windows = allWindows(guidance);

    expect(windows).toContainEqual(
      expect.objectContaining({
        kind: 'night-core',
        relatedDateKey: '2026-07-13',
        startAt: at('2026-07-12', 23),
        endAt: at('2026-07-13', 7),
      }),
    );
    expect(windows).toContainEqual(
      expect.objectContaining({
        kind: 'pre-night-nap',
        relatedDateKey: '2026-07-13',
        startAt: at('2026-07-13', 14, 40),
        endAt: at('2026-07-13', 16, 10),
        bedtimeRangeStartAt: at('2026-07-13', 14, 30),
        bedtimeRangeEndAt: at('2026-07-13', 14, 40),
      }),
    );
    expect(guidance.transitionMode).toMatchObject({
      kind: 'day-to-night',
      title: '주간 → 야간 전환',
    });
    expect(guidance.transitionMode?.windowIds).toHaveLength(2);
    expectNoWorkOverlap(appData(), guidance, '2026-07-11', 5);
  });

  it.each([
    new Date(2026, 6, 13, 7),
    new Date(2026, 6, 13, 10),
    new Date(2026, 6, 13, 14, 29),
  ])('첫 야간 보충 수면 전에는 깨어 있는 전환 시간을 빠짐없이 안내해요', (now) => {
    const guidance = buildSleepTimingGuidance(appData(), {
      now,
      additionalLimit: 0,
    });

    expect(guidance.transition).toMatchObject({
      kind: 'first-night-awake',
      title: '야간 전환 시간',
      startAt: at('2026-07-13', 7),
      endAt: at('2026-07-13', 14, 30),
      nextSleepStartAt: at('2026-07-13', 14, 40),
      nextWakeAt: at('2026-07-13', 16, 10),
      relatedDateKey: '2026-07-13',
      shiftTypeId: 'night',
      shiftName: '야간',
    });
  });

  it.each([
    new Date(2026, 6, 13, 6, 59),
    new Date(2026, 6, 13, 14, 30),
    new Date(2026, 6, 13, 14, 40),
  ])('첫 야간 전환 시간의 경계 밖에서는 전환 안내를 닫아요', (now) => {
    const guidance = buildSleepTimingGuidance(appData(), {
      now,
      additionalLimit: 8,
    });

    expect(guidance.transition).toBeNull();
  });

  it('첫 근무가 야간이면 07시부터 보충 수면 준비 전까지 전환 시간을 안내해요', () => {
    const data = appData();
    data.pattern = {
      name: '야간 시작',
      anchorDate: '2026-07-13',
      scheduleStartDate: '2026-07-13',
      shiftTypeIds: ['night'],
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 13, 7),
      additionalLimit: 0,
    });

    expect(guidance.transition).toMatchObject({
      startAt: at('2026-07-13', 7),
      endAt: at('2026-07-13', 14, 30),
      nextSleepStartAt: at('2026-07-13', 14, 40),
    });
  });

  it('연속 야간 사이에는 퇴근 후 준비 시간을 두고 다음 기상까지 최대 8시간을 잡아요', () => {
    const guidance = buildSleepTimingGuidance(appData(), {
      now: new Date(2026, 6, 14, 7, 30),
      additionalLimit: 6,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'post-night',
      relatedDateKey: '2026-07-13',
      startAt: at('2026-07-14', 8, 10),
      endAt: at('2026-07-14', 16, 10),
      bedtimeRangeStartAt: at('2026-07-14', 8),
      bedtimeRangeEndAt: at('2026-07-14', 9, 10),
      title: '연속 야간 사이 주수면',
    });
  });

  it('마지막 야간 뒤에는 짧은 회복 수면과 밤의 휴무 전환 수면을 만듭니다', () => {
    const guidance = buildSleepTimingGuidance(appData(), {
      now: new Date(2026, 6, 15, 7, 30),
      additionalLimit: 6,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'post-night',
      relatedDateKey: '2026-07-14',
      startAt: at('2026-07-15', 8),
      endAt: at('2026-07-15', 13),
      bedtimeRangeStartAt: at('2026-07-15', 8),
      bedtimeRangeEndAt: at('2026-07-15', 8, 30),
      title: '야간 후 회복 수면',
    });
    expect(guidance.additional).toContainEqual(
      expect.objectContaining({
        kind: 'off-transition',
        startAt: at('2026-07-15', 23),
        endAt: at('2026-07-16', 7),
        bedtimeRangeStartAt: at('2026-07-15', 22, 30),
        bedtimeRangeEndAt: at('2026-07-16', 0),
        title: '휴무 전환 수면',
      }),
    );
    expect(guidance.transitionMode).toMatchObject({
      kind: 'night-to-off',
      title: '야간 → 휴무 전환',
    });
    expect(guidance.transitionMode?.windowIds).toHaveLength(2);
    expectNoWorkOverlap(appData(), guidance, '2026-07-13', 5);
  });

  it('휴무 뒤 첫 야간은 주수면과 보충 수면을 하나의 전환으로 묶어요', () => {
    const data = appData();
    data.pattern = {
      name: '휴무 뒤 야간',
      anchorDate: '2026-07-12',
      scheduleStartDate: '2026-07-12',
      shiftTypeIds: ['off', 'night'],
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 12, 19),
      additionalLimit: 8,
    });

    expect(guidance.transitionMode).toMatchObject({
      kind: 'off-to-night',
      title: '휴무 → 야간 전환',
    });
    expect(guidance.transitionMode?.windowIds).toHaveLength(2);
    expect(allWindows(guidance)).toContainEqual(
      expect.objectContaining({
        kind: 'pre-night-nap',
        relatedDateKey: '2026-07-13',
      }),
    );
  });

  it('휴무 다음 주간은 실제 기상 시각에 맞춘 전환 수면으로 안내해요', () => {
    const data = appData();
    data.pattern = {
      name: '휴무 뒤 주간',
      anchorDate: '2026-07-10',
      scheduleStartDate: '2026-07-10',
      shiftTypeIds: ['off', 'day'],
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 10, 12),
      additionalLimit: 5,
    });

    expect(guidance.transitionMode).toMatchObject({
      kind: 'off-to-day',
      title: '휴무 → 주간 전환',
    });
    expect(guidance.primary).toMatchObject({
      kind: 'main',
      title: '주간 전환 수면',
      startAt: at('2026-07-10', 21, 10),
      endAt: at('2026-07-11', 5, 10),
    });
  });

  it('하루 휴무 뒤 다시 야간이면 휴무 전환 수면을 강제하지 않습니다', () => {
    const data = appData();
    data.overrides['2026-07-16'] = 'night';

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 15, 7, 30),
      additionalLimit: 10,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'post-night',
      endAt: at('2026-07-15', 13),
    });
    expect(allWindows(guidance).some((window) => window.kind === 'off-transition')).toBe(false);
    expect(allWindows(guidance)).toContainEqual(
      expect.objectContaining({
        kind: 'pre-night-nap',
        relatedDateKey: '2026-07-16',
      }),
    );
  });

  it.each([
    ['training', '교육'],
    ['reserve', '예비군'],
  ] as const)('%s 일정은 원래 야간 날짜여도 주간 수면 창을 사용해요', (type, name) => {
    const data = appData();
    data.dayExceptions['2026-07-13'] = type;

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 12, 12),
      additionalLimit: 5,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'main',
      relatedDateKey: '2026-07-13',
      shiftTypeId: `exception-${type}`,
      shiftName: name,
      startAt: at('2026-07-12', 21, 10),
      endAt: at('2026-07-13', 5, 10),
    });
  });

  it('주간·야간 대체근무를 각각 맞는 수면 규칙으로 계산해요', () => {
    const dayData = appData();
    dayData.overrides['2026-07-11'] = 'substitute-day';
    const dayGuidance = buildSleepTimingGuidance(dayData, {
      now: new Date(2026, 6, 10, 12),
      additionalLimit: 5,
    });

    expect(dayGuidance.primary).toMatchObject({
      kind: 'main',
      shiftTypeId: 'substitute-day',
    });

    const nightData = appData();
    nightData.overrides['2026-07-13'] = 'substitute-night';
    const nightGuidance = buildSleepTimingGuidance(nightData, {
      now: new Date(2026, 6, 12, 19),
      additionalLimit: 8,
    });

    expect(allWindows(nightGuidance)).toContainEqual(
      expect.objectContaining({
        kind: 'pre-night-nap',
        shiftTypeId: 'substitute-night',
        startAt: at('2026-07-13', 14, 40),
        endAt: at('2026-07-13', 16, 10),
      }),
    );
  });

  it('날짜별 야간 시간 변경을 기상과 야간 후 수면에 반영해요', () => {
    const data = appData();
    data.timeOverrides['2026-07-13'] = {
      shiftTypeId: 'night',
      startMinutes: 20 * 60,
      endMinutes: 9 * 60,
      endsNextDay: true,
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 12, 19),
      additionalLimit: 10,
    });
    const windows = allWindows(guidance);

    expect(windows).toContainEqual(
      expect.objectContaining({
        kind: 'pre-night-nap',
        startAt: at('2026-07-13', 16, 40),
        endAt: at('2026-07-13', 18, 10),
        bedtimeRangeStartAt: at('2026-07-13', 16, 30),
        bedtimeRangeEndAt: at('2026-07-13', 16, 40),
      }),
    );
    expect(windows).toContainEqual(
      expect.objectContaining({
        kind: 'post-night',
        relatedDateKey: '2026-07-13',
        startAt: at('2026-07-14', 10, 15),
        endAt: at('2026-07-14', 16, 10),
      }),
    );
    expectNoWorkOverlap(data, guidance, '2026-07-12', 5);
  });

  it('야간 직후 주간이 이어지면 겹치는 수면을 제거하고 다음 안전한 수면을 안내해요', () => {
    const data = appData();
    data.pattern = {
      name: '야간 직후 주간',
      anchorDate: '2026-07-13',
      scheduleStartDate: '2026-07-13',
      shiftTypeIds: ['night', 'day', 'off', 'day'],
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 14, 7),
      additionalLimit: 10,
    });

    expect(guidance.transitionMode).toMatchObject({
      kind: 'night-to-day',
      title: '야간 → 주간 전환',
    });
    expect(allWindows(guidance)).toContainEqual(
      expect.objectContaining({
        kind: 'off-transition',
        title: '야간 → 주간 후 수면',
        startAt: at('2026-07-14', 23),
        endAt: at('2026-07-15', 7),
      }),
    );
    expectNoWorkOverlap(data, guidance, '2026-07-13', 5);
  });

  it('전날 근무가 23:59에 끝나도 첫 야간 수면을 근무 이후로 조정해요', () => {
    const data = appData();
    data.timeOverrides['2026-07-12'] = {
      shiftTypeId: 'day',
      startMinutes: 7 * 60,
      endMinutes: 23 * 60 + 59,
      endsNextDay: false,
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 12, 19),
      additionalLimit: 10,
    });
    const core = allWindows(guidance).find(
      (window) =>
        window.kind === 'night-core' &&
        window.relatedDateKey === '2026-07-13',
    );

    expect(core).toMatchObject({
      startAt: at('2026-07-12', 23, 59),
      endAt: at('2026-07-13', 7),
      bedtimeRangeStartAt: at('2026-07-12', 23, 59),
    });
    expect(core?.guidance).toContain('근무 시간과 겹치지 않는 범위');
    expectNoWorkOverlap(data, guidance, '2026-07-11', 5);
  });

  it('기상 시각이 출발 시각보다 늦으면 저장한 출근 루틴보다 먼저 일어나도록 계산해요', () => {
    const data = appData();
    data.settings.workRoutineProfiles.day = {
      departMinutesBefore: 115,
      arriveMinutesBefore: 45,
      handoverMinutesBefore: 15,
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 10, 12),
      additionalLimit: 5,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'main',
      startAt: at('2026-07-10', 21),
      endAt: at('2026-07-11', 5),
    });
  });

  it('저장한 야간 출근 이동 시간이 늘어나면 퇴근 뒤 수면 준비 여유도 반영해요', () => {
    const data = appData();
    data.settings.workRoutineProfiles.night = {
      departMinutesBefore: 75,
      arriveMinutesBefore: 45,
      handoverMinutesBefore: 15,
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 14, 7, 30),
      additionalLimit: 8,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'post-night',
      relatedDateKey: '2026-07-13',
      startAt: at('2026-07-14', 8, 15),
      endAt: at('2026-07-14', 16, 10),
    });
    expectNoWorkOverlap(data, guidance, '2026-07-13', 4);
  });

  it('이른 첫 야간은 주수면을 보충 수면 준비 전에 끝내 겹치지 않게 해요', () => {
    const data = appData();
    data.timeOverrides['2026-07-13'] = {
      shiftTypeId: 'night',
      startMinutes: 8 * 60,
      endMinutes: 21 * 60,
      endsNextDay: false,
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 12, 12),
      additionalLimit: 10,
    });
    const windows = allWindows(guidance);
    const core = windows.find(
      (window) => window.kind === 'night-core' && window.relatedDateKey === '2026-07-13',
    );
    const nap = windows.find(
      (window) => window.kind === 'pre-night-nap' && window.relatedDateKey === '2026-07-13',
    );

    expect(core).toMatchObject({
      startAt: at('2026-07-12', 20, 30),
      endAt: at('2026-07-13', 4, 30),
    });
    expect(nap).toMatchObject({
      bedtimeRangeStartAt: at('2026-07-13', 4, 30),
      startAt: at('2026-07-13', 4, 40),
      endAt: at('2026-07-13', 6, 10),
    });
    expect(core!.endAt).toBeLessThanOrEqual(nap!.bedtimeRangeStartAt);
  });

  it.each([true, false])(
    '알람 사용 여부가 %s여도 주간 05:10과 야간 16:10 기상 경계를 유지해요',
    (alarmEnabled) => {
      const data = appData();
      data.shiftTypes = data.shiftTypes.map((shift) =>
        shift.isOff ? shift : { ...shift, alarmEnabled, alarmMinutesBefore: 110 },
      );

      const dayGuidance = buildSleepTimingGuidance(data, {
        now: new Date(2026, 6, 10, 12),
        additionalLimit: 5,
      });
      const nightGuidance = buildSleepTimingGuidance(data, {
        now: new Date(2026, 6, 12, 19),
        additionalLimit: 8,
      });

      expect(dayGuidance.primary.endAt).toBe(at('2026-07-11', 5, 10));
      expect(allWindows(nightGuidance)).toContainEqual(
        expect.objectContaining({
          kind: 'pre-night-nap',
          endAt: at('2026-07-13', 16, 10),
        }),
      );
    },
  );

  it.each([
    { now: new Date(2026, 6, 11, 5, 9), relatedDateKey: '2026-07-11' },
    { now: new Date(2026, 6, 11, 5, 10), relatedDateKey: '2026-07-12' },
    { now: new Date(2026, 6, 11, 5, 11), relatedDateKey: '2026-07-12' },
  ])('주간 05:10 기상 직전·정각·직후에 지난 수면 창을 정확히 닫아요', ({ now, relatedDateKey }) => {
    const guidance = buildSleepTimingGuidance(appData(), {
      now,
      additionalLimit: 5,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'main',
      relatedDateKey,
    });
  });

  it.each([
    { now: new Date(2026, 6, 13, 16, 9), expectedKind: 'pre-night-nap' },
    { now: new Date(2026, 6, 13, 16, 10), expectedKind: 'post-night' },
    { now: new Date(2026, 6, 13, 16, 11), expectedKind: 'post-night' },
  ])('야간 16:10 기상 직전·정각·직후에 보충 수면 창을 정확히 닫아요', ({ now, expectedKind }) => {
    const guidance = buildSleepTimingGuidance(appData(), {
      now,
      additionalLimit: 5,
    });

    expect(guidance.primary.kind).toBe(expectedKind);
  });

  it.each([
    {
      now: new Date(2026, 6, 15, 6, 45),
      expectedKind: 'post-night',
      expectedStartAt: at('2026-07-15', 8),
      expectedEndAt: at('2026-07-15', 13),
    },
    {
      now: new Date(2026, 6, 15, 8),
      expectedKind: 'post-night',
      expectedStartAt: at('2026-07-15', 8),
      expectedEndAt: at('2026-07-15', 13),
    },
    {
      now: new Date(2026, 6, 15, 13),
      expectedKind: 'off-transition',
      expectedStartAt: at('2026-07-15', 23),
      expectedEndAt: at('2026-07-16', 7),
    },
  ])(
    '마지막 야간의 06:45·08:00·13:00 경계에서 다음 수면 창을 정확히 선택해요',
    ({ now, expectedKind, expectedStartAt, expectedEndAt }) => {
      const guidance = buildSleepTimingGuidance(appData(), {
        now,
        additionalLimit: 6,
      });

      expect(guidance.primary).toMatchObject({
        kind: expectedKind,
        startAt: expectedStartAt,
        endAt: expectedEndAt,
      });
    },
  );

  it.each([
    { alarmEnabled: false, alarmMinutesBefore: 0 },
    { alarmEnabled: true, alarmMinutesBefore: 0 },
    { alarmEnabled: true, alarmMinutesBefore: 361 },
  ])('기상 기준이 범위를 벗어나면 110분을 사용해요', (alarm) => {
    const data = appData();
    const day = data.shiftTypes.find((shift) => shift.id === 'day')!;
    Object.assign(day, alarm);

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 10, 12),
    });

    expect(guidance.primary).toMatchObject({
      kind: 'main',
      endAt: at('2026-07-11', 5, 10),
      usesFallbackAlarmLead: true,
    });
  });

  it('근무 계획이 멀면 오늘 일반 수면을 우선하고 근무 수면을 추가해요', () => {
    const guidance = buildSleepTimingGuidance(appData(), {
      now: new Date(2026, 6, 15, 17),
      additionalLimit: 5,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'off-transition',
      startAt: at('2026-07-15', 23),
      endAt: at('2026-07-16', 7),
    });
    expect(guidance.additional).toContainEqual(
      expect.objectContaining({
        kind: 'main',
        relatedDateKey: '2026-07-17',
      }),
    );
  });

  it('주간 근무의 기상 시각이 지나면 07시까지 자도록 안내하지 않아요', () => {
    const data = appData();
    data.pattern = {
      name: '주간 고정',
      anchorDate: '2026-07-06',
      scheduleStartDate: '2026-07-06',
      shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 10, 6, 30),
      additionalLimit: 5,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'regular',
      title: '휴무일 일반 수면',
      startAt: at('2026-07-10', 23),
      endAt: at('2026-07-11', 7),
    });
    expect(guidance.primary.startAt).toBeGreaterThan(
      new Date(2026, 6, 10, 6, 30).getTime(),
    );
  });

  it('주간 근무일의 일반 수면 종료는 05시 10분 기상을 넘지 않아요', () => {
    const data = appData();
    data.pattern = {
      name: '주간 고정',
      anchorDate: '2026-07-06',
      scheduleStartDate: '2026-07-06',
      shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
    };

    const guidance = buildSleepTimingGuidance(data, {
      now: new Date(2026, 6, 10, 4, 30),
      additionalLimit: 5,
    });

    expect(guidance.primary).toMatchObject({
      kind: 'main',
      relatedDateKey: '2026-07-10',
      endAt: at('2026-07-10', 5, 10),
    });
  });

  it.each([
    {
      now: new Date(2026, 6, 15, 1),
      startAt: at('2026-07-14', 23),
      endAt: at('2026-07-15', 7),
    },
    {
      now: new Date(2026, 6, 15, 7),
      startAt: at('2026-07-15', 23),
      endAt: at('2026-07-16', 7),
    },
    {
      now: new Date(2026, 6, 15, 23, 30),
      startAt: at('2026-07-15', 23),
      endAt: at('2026-07-16', 7),
    },
  ])('근무표가 준비되지 않아도 현재 시각에 맞는 일반 수면을 반환해요', (expected) => {
    const data = appData();
    data.settings.setupCompleted = false;

    const guidance = buildSleepTimingGuidance(data, { now: expected.now });

    expect(guidance.primary).toMatchObject({
      kind: 'regular',
      startAt: expected.startAt,
      endAt: expected.endAt,
    });
  });
});
