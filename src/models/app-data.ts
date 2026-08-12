export const MAX_ALARM_MINUTES_BEFORE = 24 * 60 - 1;
export const LEGACY_MAX_ALARM_MINUTES_BEFORE = 7 * 24 * 60;
export const DEFAULT_ALARM_MINUTES_BEFORE = 110;

export type ShiftType = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  softColor: string;
  startMinutes: number | null;
  endMinutes: number | null;
  endsNextDay: boolean;
  isOff: boolean;
  alarmEnabled: boolean;
  alarmMinutesBefore: number;
};

export type RotationPattern = {
  name: string;
  anchorDate: string;
  /** 실제 근무표가 시작되는 첫 날짜예요. 이전 데이터는 기준일을 시작일로 사용해요. */
  scheduleStartDate?: string;
  shiftTypeIds: string[];
};

export type DayTimeOverride = {
  shiftTypeId: string;
  startMinutes: number;
  endMinutes: number;
  endsNextDay: boolean;
};

export type DayExceptionType = 'leave' | 'training' | 'reserve';

export type DayAlarmOverride =
  | { mode: 'disabled' }
  | {
      mode: 'wake-time';
      wakeMinutes: number;
      wakeDayOffset: -1 | 0;
    };

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export type WorkRoutineTiming = {
  departMinutesBefore: number;
  arriveMinutesBefore: number;
  /** 실제 근무 시작 전, 교대를 마쳐야 하는 시점까지의 분 수예요. */
  handoverMinutesBefore: number;
};

export type WorkRoutineProfiles = {
  day: WorkRoutineTiming;
  night: WorkRoutineTiming;
};

export type WidgetDisplayOptions = {
  todayShift: boolean;
  nextShift: boolean;
  nextAlarm: boolean;
};

export type AppSettings = {
  notificationsEnabled: boolean;
  sleepReminderEnabled: boolean;
  scheduledNotificationCount: number;
  lastNotificationSyncAt: string | null;
  setupCompleted: boolean;
  themeMode: ThemeMode;
  workRoutineProfiles: WorkRoutineProfiles;
  widgetDisplayOptions: WidgetDisplayOptions;
};

export type AppData = {
  version: 19;
  shiftTypes: ShiftType[];
  pattern: RotationPattern;
  overrides: Record<string, string | null>;
  timeOverrides: Record<string, DayTimeOverride>;
  dayExceptions: Record<string, DayExceptionType>;
  /** 값이 없는 날짜는 해당 근무 종류의 전역 알람 설정을 사용해요. */
  alarmOverrides: Record<string, DayAlarmOverride>;
  notes: Record<string, string>;
  /** 1.5.0 이하 설치본으로 되돌릴 때 읽을 수 있도록 빈 배열만 유지해요. */
  scheduleChangeHistory: [];
  settings: AppSettings;
};
