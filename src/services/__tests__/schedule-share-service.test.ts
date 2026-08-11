import { describe, expect, it } from 'vitest';

import type { ShiftType } from '../../models/app-data';
import type { ShareableScheduleDay } from '../schedule-share-service';
import { buildScheduleShareText } from '../schedule-share-service';

const shift = (
  id: string,
  name: string,
  startMinutes: number | null,
  endMinutes: number | null,
  endsNextDay = false,
): ShiftType => ({
  id,
  name,
  shortName: name.slice(0, 1),
  color: '#000000',
  softColor: '#ffffff',
  startMinutes,
  endMinutes,
  endsNextDay,
  isOff: startMinutes === null || endMinutes === null,
  alarmEnabled: startMinutes !== null && endMinutes !== null,
  alarmMinutesBefore: 120,
});

const day = (
  dateKey: string,
  selectedShift: ShiftType | null,
  overrides: Partial<ShareableScheduleDay> = {},
): ShareableScheduleDay => ({
  dateKey,
  scheduleActive: true,
  shift: selectedShift,
  dayException: undefined,
  ...overrides,
});

describe('buildScheduleShareText', () => {
  it('회사 표가 30분 단위로 올림되어도 공유에는 실제 퇴근 시각을 사용합니다', () => {
    const dayShift = shift('day', '주간', 7 * 60, 17 * 60 + 45);
    const nightShift = shift('night', '야간', 18 * 60, 6 * 60 + 45, true);

    expect(
      buildScheduleShareText(
        [day('2026-07-16', dayShift), day('2026-07-17', nightShift)],
        { includeHeading: false },
      ),
    ).toBe(
      [
        '7월 16일(목) · 주간(07:00~17:45)',
        '7월 17일(금) · 야간(18:00~다음 날 06:45)',
      ].join('\n'),
    );
  });

  it('선택 순서와 중복에 관계없이 날짜별 최신 일정을 한 번씩 공유해요', () => {
    const dayShift = shift('day', '주간', 7 * 60, 18 * 60);
    const changedDayShift = shift('day', '주간 변경', 8 * 60, 17 * 60);
    const nightShift = shift('night', '야간', 18 * 60, 7 * 60, true);

    expect(
      buildScheduleShareText([
        day('2026-07-24', nightShift),
        day('2026-07-23', dayShift),
        day('2026-07-23', changedDayShift),
      ]),
    ).toBe(
      [
        '알람표 근무 일정',
        '',
        '7월 23일(목) · 주간 변경(08:00~17:00)',
        '7월 24일(금) · 야간(18:00~다음 날 07:00)',
      ].join('\n'),
    );
  });

  it('표시 일정과 시간이 같은 날짜를 한 줄로 묶어요', () => {
    const dayShift = shift('day', '주간', 7 * 60, 18 * 60);
    const nightShift = shift('night', '야간', 18 * 60, 7 * 60, true);

    expect(
      buildScheduleShareText(
        [
          day('2026-07-24', dayShift),
          day('2026-07-23', dayShift),
          day('2026-07-25', nightShift),
        ],
        { includeHeading: false },
      ),
    ).toBe(
      [
        '7월 23일(목)~24일(금) · 주간(07:00~18:00)',
        '7월 25일(토) · 야간(18:00~다음 날 07:00)',
      ].join('\n'),
    );
  });

  it('월이나 연도가 달라지면 날짜 범위를 모호하지 않게 표시해요', () => {
    const dayShift = shift('day', '주간', 7 * 60, 18 * 60);

    expect(
      buildScheduleShareText(
        [
          day('2026-12-31', dayShift),
          day('2027-01-01', dayShift),
        ],
        { includeHeading: false },
      ),
    ).toBe(
      '2026년 12월 31일(목)~2027년 1월 1일(금) · 주간(07:00~18:00)',
    );
  });

  it('휴무와 일정 없음은 시간이 없는 휴무로 자연스럽게 안내해요', () => {
    const offShift = shift('off', '휴무', null, null);

    expect(
      buildScheduleShareText(
        [day('2026-07-25', offShift), day('2026-07-26', null)],
        { includeHeading: false },
      ),
    ).toBe('7월 25일(토)~26일(일) · 휴무');
  });

  it('교육·예비군은 예외 일정 이름과 적용되는 주간 시간을 함께 표시해요', () => {
    const dayShift = shift('day', '주간', 7 * 60, 18 * 60);

    expect(
      buildScheduleShareText(
        [
          day('2026-07-14', dayShift, { dayException: 'training' }),
          day('2026-07-15', dayShift, { dayException: 'reserve' }),
        ],
        { includeHeading: false },
      ),
    ).toBe(
      ['7월 14일(화) · 교육(07:00~18:00)', '7월 15일(수) · 예비군(07:00~18:00)'].join(
        '\n',
      ),
    );
  });

  it('연차와 첫 근무일 이전 날짜를 근무 시간 없이 구분해요', () => {
    const offShift = shift('exception-leave', '연차', null, null);

    expect(
      buildScheduleShareText(
        [
          day('2026-07-12', null, { scheduleActive: false }),
          day('2026-07-13', offShift, { dayException: 'leave' }),
        ],
        { includeHeading: false },
      ),
    ).toBe(
      ['7월 12일(일) · 첫 근무일 이전', '7월 13일(월) · 연차'].join('\n'),
    );
  });

  it('같은 일정이어도 날짜가 떨어져 있으면 쉼표 목록으로 유지해요', () => {
    const dayShift = shift('day', '주간', 7 * 60, 18 * 60);

    expect(
      buildScheduleShareText(
        [day('2026-07-16', dayShift), day('2026-07-18', dayShift)],
        { includeHeading: false },
      ),
    ).toBe('7월 16일(목), 18일(토) · 주간(07:00~18:00)');
  });

  it('빈 선택과 올바르지 않은 날짜를 명확하게 거부해요', () => {
    expect(() => buildScheduleShareText([])).toThrow('공유할 일정을 한 개 이상 선택해 주세요.');
    expect(() => buildScheduleShareText([day('2026-02-30', null)])).toThrow(
      '공유할 일정에 올바르지 않은 날짜가 있어요.',
    );
  });
});
