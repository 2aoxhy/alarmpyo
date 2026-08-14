import { palette } from '../constants/app-theme';
import {
  DAY_SHIFT_END_MINUTES,
  DAY_SHIFT_START_MINUTES,
  EVENING_SHIFT_END_MINUTES,
  EVENING_SHIFT_START_MINUTES,
  NIGHT_SHIFT_END_MINUTES,
  NIGHT_SHIFT_START_MINUTES,
} from '../constants/shift-schedule';
import {
  DEFAULT_ALARM_MINUTES_BEFORE,
  type ShiftType,
} from '../models/app-data';

export type DefaultWorkShiftId =
  | 'day'
  | 'evening'
  | 'night'
  | 'substitute-day'
  | 'substitute-night';

const DEFAULT_SHIFT_TYPES: readonly ShiftType[] = [
  {
    id: 'day',
    name: '주간',
    shortName: '주',
    color: palette.mint,
    softColor: palette.mintSoft,
    startMinutes: DAY_SHIFT_START_MINUTES,
    endMinutes: DAY_SHIFT_END_MINUTES,
    endsNextDay: false,
    isOff: false,
    alarmEnabled: true,
    alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
  },
  {
    id: 'evening',
    name: '오후',
    shortName: '오',
    color: palette.indigoDark,
    softColor: palette.indigoSoft,
    startMinutes: EVENING_SHIFT_START_MINUTES,
    endMinutes: EVENING_SHIFT_END_MINUTES,
    endsNextDay: false,
    isOff: false,
    alarmEnabled: true,
    alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
  },
  {
    id: 'night',
    name: '야간',
    shortName: '야',
    color: palette.violet,
    softColor: palette.violetSoft,
    startMinutes: NIGHT_SHIFT_START_MINUTES,
    endMinutes: NIGHT_SHIFT_END_MINUTES,
    endsNextDay: true,
    isOff: false,
    alarmEnabled: true,
    alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
  },
  {
    id: 'substitute-day',
    name: '주간 대체근무',
    shortName: '대주',
    color: palette.amber,
    softColor: palette.amberSoft,
    startMinutes: DAY_SHIFT_START_MINUTES,
    endMinutes: DAY_SHIFT_END_MINUTES,
    endsNextDay: false,
    isOff: false,
    alarmEnabled: true,
    alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
  },
  {
    id: 'substitute-night',
    name: '야간 대체근무',
    shortName: '대야',
    color: palette.amber,
    softColor: palette.amberSoft,
    startMinutes: NIGHT_SHIFT_START_MINUTES,
    endMinutes: NIGHT_SHIFT_END_MINUTES,
    endsNextDay: true,
    isOff: false,
    alarmEnabled: true,
    alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
  },
  {
    id: 'off',
    name: '휴무',
    shortName: '휴',
    color: palette.inkSoft,
    softColor: palette.surfaceSoft,
    startMinutes: null,
    endMinutes: null,
    endsNextDay: false,
    isOff: true,
    alarmEnabled: false,
    alarmMinutesBefore: 0,
  },
];

export function createDefaultShiftTypes(): ShiftType[] {
  return DEFAULT_SHIFT_TYPES.map((shift) => ({ ...shift }));
}

export function createDefaultWorkShift(id: DefaultWorkShiftId): ShiftType {
  const shift = DEFAULT_SHIFT_TYPES.find((item) => item.id === id);
  if (!shift) throw new Error(`기본 근무 종류 ${id}를 찾을 수 없어요.`);
  return { ...shift };
}
