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
  evening: WorkRoutineTiming;
  night: WorkRoutineTiming;
};

export type WidgetDisplayOptions = {
  todayShift: boolean;
  nextShift: boolean;
  nextAlarm: boolean;
};

export type PayrollAdjustment = 'fixed-date' | 'previous-business-day';

export type PayrollSettings = {
  /** 매월 지급 기준일입니다. 해당 월에 없는 날짜는 말일을 사용합니다. */
  day: number;
  adjustment: PayrollAdjustment;
};

/** 외부 패턴 파일에서만 사용하는 안정적인 근무 코드입니다. */
export type PatternShiftCode =
  | 'DAY'
  | 'EVENING'
  | 'NIGHT'
  | 'OFF'
  | 'DAY_SUBSTITUTE'
  | 'NIGHT_SUBSTITUTE';

export type PatternVaultSource = 'official' | 'user' | 'imported';
export type AppliedPatternSource = 'legacy' | PatternVaultSource;

/** V12 패턴 보관소가 AppData 버전을 다시 올리지 않고 사용할 저장 계약입니다. */
export type PatternVaultEntry = {
  id: string;
  source: PatternVaultSource;
  name: string;
  author: string | null;
  sourceVersion: number;
  anchorDate: string;
  shiftCodes: PatternShiftCode[];
  createdAt: string;
  updatedAt: string;
};

export type PatternHistoryEntry = {
  id: string;
  appliedAt: string;
  source: AppliedPatternSource;
  patternId: string | null;
  previousPattern: RotationPattern;
  nextPattern: RotationPattern;
  overrideDateKeys: string[];
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
  dismissedUpdateVersionCode: number | null;
};

export type AppData = {
  version: 21;
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
  payrollSettings: PayrollSettings;
  /** V12에서 사용할 독립 패턴 사본입니다. V11에서는 빈 배열로 시작합니다. */
  patternVault: PatternVaultEntry[];
  /** 최근 적용 이력입니다. 최대 10건만 보존합니다. */
  patternHistory: PatternHistoryEntry[];
  appliedPatternSource: AppliedPatternSource;
  settings: AppSettings;
};
