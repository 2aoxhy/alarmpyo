import { describe, expect, it } from 'vitest';

import type { ShiftType } from '../../models/app-data';
import { dateAtMinutes } from '../../utils/date';
import {
  buildWorkRoutinePlan,
  ROUTINE_ALARM_LEAD_MINUTES,
} from '../work-routine-planner';

const DAY: ShiftType = {
  id: 'day',
  name: '주간',
  shortName: '주',
  color: '#000000',
  softColor: '#ffffff',
  startMinutes: 7 * 60,
  endMinutes: 17 * 60 + 45,
  endsNextDay: false,
  isOff: false,
  alarmEnabled: true,
  alarmMinutesBefore: 110,
};

const NIGHT: ShiftType = {
  ...DAY,
  id: 'night',
  name: '야간',
  shortName: '야',
  startMinutes: 18 * 60,
  endMinutes: 6 * 60 + 45,
  endsNextDay: true,
};

function at(dateKey: string, hours: number, minutes = 0): number {
  return dateAtMinutes(dateKey, hours * 60 + minutes).getTime();
}

describe('buildWorkRoutinePlan', () => {
  it('주간 루틴의 주요 시각과 상세 단계를 계산합니다', () => {
    const plan = buildWorkRoutinePlan('2026-07-16', DAY, new Date(2026, 6, 16, 5, 35));

    expect(ROUTINE_ALARM_LEAD_MINUTES).toBe(110);
    expect(plan).toMatchObject({
      kind: 'day',
      title: '주간 출근 루틴',
      wakeAt: at('2026-07-16', 5, 10),
      departAt: at('2026-07-16', 6),
      arriveAt: at('2026-07-16', 6, 15),
      handoverAt: at('2026-07-16', 6, 45),
      workStartAt: at('2026-07-16', 7),
      summary: '05:10 기상 · 06:00 출발 · 06:45 교대',
      currentStep: {
        id: 'dress-and-prepare',
        at: at('2026-07-16', 5, 30),
        endAt: at('2026-07-16', 5, 45),
        instruction: '복장을 갖추고 출근 준비를 하세요.',
      },
    });
    expect(plan?.steps).toEqual([
      {
        id: 'wake-and-shower',
        at: at('2026-07-16', 5, 10),
        endAt: at('2026-07-16', 5, 30),
        instruction: '기상한 뒤 샤워하고 머리를 말리세요.',
      },
      {
        id: 'dress-and-prepare',
        at: at('2026-07-16', 5, 30),
        endAt: at('2026-07-16', 5, 45),
        instruction: '복장을 갖추고 출근 준비를 하세요.',
      },
      {
        id: 'meal-and-water',
        at: at('2026-07-16', 5, 45),
        endAt: at('2026-07-16', 5, 55),
        instruction: '간단히 먹고 물을 챙기세요.',
      },
      {
        id: 'belongings-check',
        at: at('2026-07-16', 5, 55),
        endAt: at('2026-07-16', 6),
        instruction: '신분증·휴대폰·출입 관련 준비물을 확인하세요.',
      },
      {
        id: 'depart',
        at: at('2026-07-16', 6),
        endAt: at('2026-07-16', 6, 15),
        instruction: '회사로 출발하세요.',
      },
      {
        id: 'arrive-and-change',
        at: at('2026-07-16', 6, 15),
        endAt: at('2026-07-16', 6, 35),
        instruction: '도착 후 옷을 갈아입고 복장을 정리하세요.',
      },
      {
        id: 'final-prepare',
        at: at('2026-07-16', 6, 35),
        endAt: at('2026-07-16', 6, 45),
        instruction: '교대 전 준비를 마무리하세요.',
      },
      {
        id: 'handover',
        at: at('2026-07-16', 6, 45),
        endAt: at('2026-07-16', 7),
        instruction: '교대하세요.',
      },
    ]);
  });

  it('야간 루틴의 주요 시각과 현재 단계를 계산합니다', () => {
    const plan = buildWorkRoutinePlan('2026-07-16', NIGHT, new Date(2026, 6, 16, 16, 40));

    expect(plan).toMatchObject({
      kind: 'night',
      title: '야간 출근 루틴',
      wakeAt: at('2026-07-16', 16, 10),
      departAt: at('2026-07-16', 17),
      arriveAt: at('2026-07-16', 17, 15),
      handoverAt: at('2026-07-16', 17, 45),
      workStartAt: at('2026-07-16', 18),
      summary: '16:10 기상 · 17:00 출발 · 17:45 교대',
      currentStep: {
        id: 'meal-or-snack',
        at: at('2026-07-16', 16, 35),
        endAt: at('2026-07-16', 16, 50),
        instruction: '식사하거나 간단한 간식을 드세요.',
      },
    });
    expect(plan?.steps.map((step) => [step.id, step.at, step.endAt])).toEqual([
      ['wake-and-prepare', at('2026-07-16', 16, 10), at('2026-07-16', 16, 35)],
      ['meal-or-snack', at('2026-07-16', 16, 35), at('2026-07-16', 16, 50)],
      ['belongings-check', at('2026-07-16', 16, 50), at('2026-07-16', 17)],
      ['depart', at('2026-07-16', 17), at('2026-07-16', 17, 15)],
      ['arrive-and-change', at('2026-07-16', 17, 15), at('2026-07-16', 17, 35)],
      ['final-prepare', at('2026-07-16', 17, 35), at('2026-07-16', 17, 45)],
      ['handover', at('2026-07-16', 17, 45), at('2026-07-16', 18)],
    ]);
  });

  it('근무 알람 시간을 기상 시각과 첫 단계에 동일하게 반영합니다', () => {
    const plan = buildWorkRoutinePlan(
      '2026-07-16',
      { ...DAY, alarmMinutesBefore: 120 },
      new Date(2026, 6, 16, 5, 5),
    );

    expect(plan).toMatchObject({
      wakeAt: at('2026-07-16', 5),
      summary: '05:00 기상 · 06:00 출발 · 06:45 교대',
      currentStep: { id: 'wake-and-shower', at: at('2026-07-16', 5) },
    });
    expect(plan?.steps[0].endAt).toBe(at('2026-07-16', 5, 30));
  });

  it.each([true, false])(
    '알람 사용 여부가 %s여도 유효한 110분 기상 기준을 유지합니다',
    (alarmEnabled) => {
      const dayPlan = buildWorkRoutinePlan(
        '2026-07-16',
        { ...DAY, alarmEnabled, alarmMinutesBefore: 110 },
        new Date(2026, 6, 16, 5, 10),
      );
      const nightPlan = buildWorkRoutinePlan(
        '2026-07-16',
        { ...NIGHT, alarmEnabled, alarmMinutesBefore: 110 },
        new Date(2026, 6, 16, 16, 10),
      );

      expect(dayPlan?.wakeAt).toBe(at('2026-07-16', 5, 10));
      expect(nightPlan?.wakeAt).toBe(at('2026-07-16', 16, 10));
    },
  );

  it.each([0, 361])('기상 기준이 %s분이면 110분 기본값으로 안전하게 보정합니다', (minutes) => {
    const plan = buildWorkRoutinePlan(
      '2026-07-16',
      { ...DAY, alarmEnabled: false, alarmMinutesBefore: minutes },
      new Date(2026, 6, 16, 5, 10),
    );

    expect(plan).toMatchObject({
      wakeAt: at('2026-07-16', 5, 10),
      summary: '05:10 기상 · 06:00 출발 · 06:45 교대',
    });
  });

  it('최종 근무 시작 시각을 바꾸면 루틴 전체를 같은 간격으로 이동합니다', () => {
    const override = { ...NIGHT, startMinutes: 20 * 60, endMinutes: 9 * 60 };
    const plan = buildWorkRoutinePlan('2026-07-16', override, new Date(2026, 6, 16, 18, 15));

    expect(plan).toMatchObject({
      wakeAt: at('2026-07-16', 18, 10),
      departAt: at('2026-07-16', 19),
      arriveAt: at('2026-07-16', 19, 15),
      handoverAt: at('2026-07-16', 19, 45),
      workStartAt: at('2026-07-16', 20),
      currentStep: { id: 'wake-and-prepare' },
    });
  });

  it('주간 사용자 지정 출발·도착·교대 시간을 반영해요', () => {
    const profiles = {
      day: {
        departMinutesBefore: 90,
        arriveMinutesBefore: 60,
        handoverMinutesBefore: 20,
      },
      night: {
        departMinutesBefore: 75,
        arriveMinutesBefore: 50,
        handoverMinutesBefore: 10,
      },
    };

    const plan = buildWorkRoutinePlan(
      '2026-07-16',
      DAY,
      new Date(2026, 6, 16, 5, 45),
      profiles,
    );

    expect(plan).toMatchObject({
      kind: 'day',
      wakeAt: at('2026-07-16', 5, 10),
      departAt: at('2026-07-16', 5, 30),
      arriveAt: at('2026-07-16', 6),
      handoverAt: at('2026-07-16', 6, 40),
      workStartAt: at('2026-07-16', 7),
      summary: '05:10 기상 · 05:30 출발 · 06:40 교대',
      currentStep: { id: 'depart' },
    });
    expect(
      plan?.steps.map(({ id, at, endAt }) => ({ id, at, endAt })),
    ).toContainEqual({
      id: 'handover',
      at: at('2026-07-16', 6, 40),
      endAt: at('2026-07-16', 7),
    });
  });

  it('야간 대체근무에는 야간 사용자 지정 시간을 적용해요', () => {
    const profiles = {
      day: {
        departMinutesBefore: 90,
        arriveMinutesBefore: 60,
        handoverMinutesBefore: 20,
      },
      night: {
        departMinutesBefore: 75,
        arriveMinutesBefore: 50,
        handoverMinutesBefore: 10,
      },
    };
    const substituteNight = {
      ...NIGHT,
      id: 'substitute-night',
      endsNextDay: false,
    };

    const plan = buildWorkRoutinePlan(
      '2026-07-16',
      substituteNight,
      new Date(2026, 6, 16, 17),
      profiles,
    );

    expect(plan).toMatchObject({
      kind: 'night',
      departAt: at('2026-07-16', 16, 45),
      arriveAt: at('2026-07-16', 17, 10),
      handoverAt: at('2026-07-16', 17, 50),
      summary: '16:10 기상 · 16:45 출발 · 17:50 교대',
    });
  });

  it('날짜를 넘기는 주간 근무도 근무 ID에 맞춰 주간 시간을 적용해요', () => {
    const profiles = {
      day: {
        departMinutesBefore: 90,
        arriveMinutesBefore: 55,
        handoverMinutesBefore: 20,
      },
      night: {
        departMinutesBefore: 75,
        arriveMinutesBefore: 50,
        handoverMinutesBefore: 10,
      },
    };

    const plan = buildWorkRoutinePlan(
      '2026-07-16',
      { ...DAY, endsNextDay: true },
      new Date(2026, 6, 16, 5, 40),
      profiles,
    );

    expect(plan).toMatchObject({
      kind: 'day',
      departAt: at('2026-07-16', 5, 30),
      arriveAt: at('2026-07-16', 6, 5),
      handoverAt: at('2026-07-16', 6, 40),
    });
  });

  it('사용자 지정 시간이 잘못되거나 기상 시각보다 이르면 계획을 만들지 않아요', () => {
    const invalidOrder = {
      day: {
        departMinutesBefore: 45,
        arriveMinutesBefore: 60,
        handoverMinutesBefore: 15,
      },
      night: {
        departMinutesBefore: 60,
        arriveMinutesBefore: 45,
        handoverMinutesBefore: 15,
      },
    };
    const departBeforeWake = {
      day: {
        departMinutesBefore: 120,
        arriveMinutesBefore: 60,
        handoverMinutesBefore: 15,
      },
      night: {
        departMinutesBefore: 60,
        arriveMinutesBefore: 45,
        handoverMinutesBefore: 15,
      },
    };

    expect(buildWorkRoutinePlan('2026-07-16', DAY, undefined, invalidOrder)).toBeNull();
    expect(buildWorkRoutinePlan('2026-07-16', DAY, undefined, departBeforeWake)).toBeNull();
  });

  it.each([
    { shift: { ...DAY, isOff: true }, dateKey: '2026-07-16' },
    { shift: { ...DAY, startMinutes: null }, dateKey: '2026-07-16' },
    { shift: { ...DAY, endMinutes: 7 * 60 }, dateKey: '2026-07-16' },
    { shift: { ...DAY, startMinutes: -1 }, dateKey: '2026-07-16' },
    { shift: DAY, dateKey: '2026-02-30' },
  ])('휴무·잘못된 시간·잘못된 날짜는 계획을 만들지 않습니다', ({ dateKey, shift }) => {
    expect(buildWorkRoutinePlan(dateKey, shift)).toBeNull();
  });

  it('루틴 시작 전에는 현재 단계가 없습니다', () => {
    const plan = buildWorkRoutinePlan('2026-07-16', DAY, new Date(2026, 6, 16, 4, 40));
    expect(plan?.currentStep).toBeNull();
  });

  it('잘못된 현재 시각은 명확히 거부합니다', () => {
    expect(() => buildWorkRoutinePlan('2026-07-16', DAY, new Date(Number.NaN))).toThrow(
      '근무 루틴 계산 시각이 올바르지 않습니다.',
    );
  });
});
