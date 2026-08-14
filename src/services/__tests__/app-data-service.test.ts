import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ALARM_MINUTES_BEFORE,
  MAX_ALARM_MINUTES_BEFORE,
  type AppData,
} from '../../models/app-data';
import {
  DAY_SHIFT_START_MINUTES,
  LEGACY_DAY_SHIFT_START_MINUTES,
  LEGACY_NIGHT_SHIFT_START_MINUTES,
  NIGHT_SHIFT_START_MINUTES,
} from '../../constants/shift-schedule';
import {
  appDataFromImportPreview,
  applyDayAlarmOverride,
  canonicalizeAppData,
  clearScheduleOverridesFrom,
  createDefaultAppData,
  exportAppDataToJson,
  parseAppDataJson,
  previewAppDataImport,
  pruneInvalidDayAlarmOverrides,
  resolveDayAlarmOverrideFromAppData,
  resolveEffectiveDayFromAppData,
  resolveShiftFromAppData,
  serializeAppData,
  validateAndMigrateAppData,
  withoutAlarmRuntimeState,
} from '../app-data-service';
import {
  APP_DATA_AUTOMATIC_BACKUP_KEY,
  APP_DATA_CORRUPT_BACKUP_KEY,
  APP_DATA_EXPLICIT_RESET_MARKER_KEY,
  APP_DATA_LAST_KNOWN_GOOD_KEY,
  APP_DATA_STORAGE_KEY,
  canRecoverAppDataFromSafetyBackup,
  clearExplicitResetMarker,
  createLatestStorageValueCoordinator,
  createSerializedMutationCoordinator,
  createSerializedStorageWriter,
  getPersistedMutationOutcome,
  loadAppDataFromStorage,
  persistSnapshotWithLastKnownGood,
  readAutomaticBackup,
  readLastKnownGoodBackup,
  readRecoveryBackup,
  type StorageAdapter,
  writeAutomaticBackup,
  writeExplicitResetMarker,
  writeLastKnownGoodBackup,
} from '../app-storage-service';
import { MAX_APP_DATA_BYTES } from '../backup-file-policy';
import { LEGACY_APP_DATA_BACKUP_FORMAT } from '../../infrastructure/app-data/import-envelope';
import {
  createWorkPatternFromReference,
  WEEKDAY_PATTERN_SHIFT_TYPE_IDS,
} from '../../utils/work-pattern';

describe('v19 날짜별 알람', () => {
  it('실제 v18 자료는 날짜별 알람 없이 v19로 마이그레이션해요', () => {
    const current = createDefaultAppData('2026-07-11');
    const { alarmOverrides: _alarmOverrides, ...v18 } = current;
    const parsed = validateAndMigrateAppData({
      ...v18,
      version: 18,
    });

    expect(parsed.migratedFromVersion).toBe(18);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.alarmOverrides).toEqual({});
  });

  it('유효한 날짜별 알람은 전체 백업과 복원에서 그대로 유지해요', () => {
    const data = createDefaultAppData('2026-07-11');
    data.alarmOverrides = {
      '2026-07-11': { mode: 'wake-time', wakeMinutes: 5 * 60 + 10, wakeDayOffset: 0 },
      '2026-07-12': { mode: 'disabled' },
    };

    const restored = appDataFromImportPreview(
      previewAppDataImport(exportAppDataToJson(data)),
    );

    expect(restored.alarmOverrides).toEqual(data.alarmOverrides);
  });

  it('잘못된 날짜, 기상 시각, 날짜 기준은 v19 데이터에서 거절해요', () => {
    const current = createDefaultAppData('2026-07-11');
    const invalidValues = [
      { '2026-02-30': { mode: 'disabled' } },
      { '2026-07-11': { mode: 'wake-time', wakeMinutes: 1440, wakeDayOffset: 0 } },
      { '2026-07-11': { mode: 'wake-time', wakeMinutes: 300, wakeDayOffset: 1 } },
      { '2026-07-11': { mode: 'unknown' } },
    ];

    invalidValues.forEach((alarmOverrides) => {
      expect(() => validateAndMigrateAppData({ ...current, alarmOverrides })).toThrow();
    });
  });

  it('첫 근무일 전·휴무·연차는 저장을 거절하고 일정 변경 뒤 정리해요', () => {
    const data = createDefaultAppData('2026-07-11');
    const wake = { mode: 'wake-time', wakeMinutes: 5 * 60, wakeDayOffset: 0 } as const;

    expect(applyDayAlarmOverride(data, '2026-07-10', wake)).toBeNull();
    expect(applyDayAlarmOverride(data, '2026-07-15', wake)).toBeNull();

    data.dayExceptions['2026-07-11'] = 'leave';
    expect(applyDayAlarmOverride(data, '2026-07-11', wake)).toBeNull();

    delete data.dayExceptions['2026-07-11'];
    const saved = applyDayAlarmOverride(data, '2026-07-11', wake)!;
    expect(resolveDayAlarmOverrideFromAppData(saved, '2026-07-11')).toEqual(wake);

    const changedToLeave = {
      ...saved,
      dayExceptions: { ...saved.dayExceptions, '2026-07-11': 'leave' as const },
    };
    expect(pruneInvalidDayAlarmOverrides(changedToLeave).alarmOverrides).toEqual({});
  });
});

describe('기본 근무표 일정 정리', () => {
  it('기준 날짜 이후의 직접 근무·시간·알람 변경만 제거해요', () => {
    const data = createDefaultAppData('2026-07-11');
    data.overrides = {
      '2026-07-12': 'night',
      '2026-07-13': 'day',
      '2026-07-14': null,
    };
    data.timeOverrides = {
      '2026-07-12': {
        shiftTypeId: 'night',
        startMinutes: 19 * 60,
        endMinutes: 7 * 60,
        endsNextDay: true,
      },
      '2026-07-13': {
        shiftTypeId: 'day',
        startMinutes: 6 * 60,
        endMinutes: 18 * 60,
        endsNextDay: false,
      },
    };
    data.dayExceptions = {
      '2026-07-13': 'leave',
      '2026-07-15': 'training',
    };
    data.alarmOverrides = {
      '2026-07-12': { mode: 'disabled' },
      '2026-07-13': { mode: 'wake-time', wakeMinutes: 5 * 60, wakeDayOffset: 0 },
    };
    data.notes = {
      '2026-07-13': '중요한 개인 메모',
      '2026-07-16': '보존할 메모',
    };

    const result = clearScheduleOverridesFrom(data, '2026-07-13');

    expect(result.overrides).toEqual({ '2026-07-12': 'night' });
    expect(result.timeOverrides).toEqual({
      '2026-07-12': {
        shiftTypeId: 'night',
        startMinutes: 19 * 60,
        endMinutes: 7 * 60,
        endsNextDay: true,
      },
    });
    expect(result.dayExceptions).toEqual(data.dayExceptions);
    expect(result.alarmOverrides).toEqual({ '2026-07-12': { mode: 'disabled' } });
    expect(result.notes).toEqual(data.notes);
  });

  it('정리할 직접 변경이 없으면 기존 데이터를 그대로 사용합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    data.overrides['2026-07-12'] = 'night';

    expect(clearScheduleOverridesFrom(data, '2026-07-13')).toBe(data);
    expect(() => clearScheduleOverridesFrom(data, '2026-02-30')).toThrow(
      '직접 변경 일정을 정리할 기준 날짜가 올바르지 않아요.',
    );
  });
});

describe('v13 활동 자료 제거 이전', () => {
  it('유효한 활동 자료가 있어도 핵심 근무표를 보존하고 v14에서 활동 키를 제거해요', () => {
    const current = createDefaultAppData('2026-07-11');
    const source = {
      ...current,
      version: 13,
      overrides: { '2026-07-12': 'night' },
      notes: { '2026-07-12': '보존할 메모' },
      activityPlans: {
        day: [{ offsetMinutes: 0, kind: 'work', label: '판독1' }],
        night: [{ offsetMinutes: 30, kind: 'break', label: '휴게' }],
      },
      datedActivityPlans: {
        '2026-07-12': [{ offsetMinutes: 0, kind: 'work', label: '반출입' }],
      },
      activityCatalog: [
        {
          id: 'legacy-activity',
          name: '판독1',
          kind: 'work',
          aliases: [],
          favorite: true,
          usageCount: 3,
          lastUsedAt: '2026-07-17T01:02:03.000Z',
        },
      ],
      settings: {
        ...current.settings,
        activityHandoverNotificationsEnabled: true,
      },
    };

    const parsed = validateAndMigrateAppData(source);
    const roundTrip = parseAppDataJson(serializeAppData(parsed.data));

    expect(parsed.migratedFromVersion).toBe(13);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.overrides).toEqual({ '2026-07-12': 'night' });
    expect(parsed.data.notes).toEqual({ '2026-07-12': '보존할 메모' });
    expect(parsed.data).not.toHaveProperty('activityPlans');
    expect(parsed.data).not.toHaveProperty('datedActivityPlans');
    expect(parsed.data).not.toHaveProperty('activityCatalog');
    expect(parsed.data.settings).not.toHaveProperty(
      'activityHandoverNotificationsEnabled',
    );
    expect(roundTrip.data).toEqual(parsed.data);
  });

  it('손상된 활동 자료도 핵심 근무표 복구를 막지 않고 v19 재저장에서 버려요', () => {
    const current = createDefaultAppData('2026-07-11');
    const source = {
      ...current,
      version: 13,
      pattern: {
        ...current.pattern,
        anchorDate: '2026-07-10',
        scheduleStartDate: '2026-07-10',
      },
      dayExceptions: { '2026-07-12': 'training' },
      activityPlans: '손상된 활동표',
      datedActivityPlans: { '2026-02-30': { invalid: true } },
      activityCatalog: 1234,
      settings: {
        ...current.settings,
        activityHandoverNotificationsEnabled: { invalid: true },
      },
    };

    const parsed = validateAndMigrateAppData(source);
    const exported = exportAppDataToJson(
      parsed.data,
      new Date('2026-07-26T12:00:00.000Z'),
    );
    const restored = appDataFromImportPreview(previewAppDataImport(exported));

    expect(parsed.migratedFromVersion).toBe(13);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.pattern.anchorDate).toBe('2026-07-10');
    expect(parsed.data.dayExceptions).toEqual({ '2026-07-12': 'training' });
    expect(parsed.data).not.toHaveProperty('activityPlans');
    expect(parsed.data).not.toHaveProperty('datedActivityPlans');
    expect(parsed.data).not.toHaveProperty('activityCatalog');
    expect(parsed.data.settings).not.toHaveProperty(
      'activityHandoverNotificationsEnabled',
    );
    expect(restored).toEqual(parsed.data);
  });
});

describe('사용하지 않는 변경 기록 제거', () => {
  it('변경 기록은 읽을 때 버리고 v19 저장 대상으로 표시해요', () => {
    const current = createDefaultAppData('2026-07-11');
    const parsed = validateAndMigrateAppData({
      ...current,
      scheduleChangeHistory: [{ 손상된_이전_기록: true }],
    });

    expect(parsed.data.scheduleChangeHistory).toEqual([]);
    expect(parsed.requiresPersistence).toBe(true);
    expect(serializeAppData(parsed.data)).toContain('"scheduleChangeHistory":[]');
  });

  it('v19에 호환 필드가 없으면 빈 배열로 다시 저장해요', () => {
    const current = createDefaultAppData('2026-07-11');
    const withoutHistory = Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== 'scheduleChangeHistory'),
    );
    const parsed = validateAndMigrateAppData(withoutHistory);

    expect(parsed.data.scheduleChangeHistory).toEqual([]);
    expect(parsed.requiresPersistence).toBe(true);
    expect(serializeAppData(parsed.data)).toContain('"scheduleChangeHistory":[]');
  });
});

class MemoryStorage implements StorageAdapter {
  readonly values = new Map<string, string>();
  readonly writes: { key: string; value: string }[] = [];
  readError = false;

  async getItem(key: string): Promise<string | null> {
    if (this.readError) throw new Error('읽기 실패');
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes.push({ key, value });
    this.values.set(key, value);
  }
}

describe('데이터 변경 직렬화', () => {
  it('데이터 저장 뒤 알람만 실패한 작업은 완료와 부분 실패를 함께 반환합니다', () => {
    expect(getPersistedMutationOutcome(true, false)).toEqual({
      operationSucceeded: true,
      announceSuccess: false,
      partialFailure: true,
    });
    expect(getPersistedMutationOutcome(true, true)).toEqual({
      operationSucceeded: true,
      announceSuccess: true,
      partialFailure: false,
    });
    expect(getPersistedMutationOutcome(false, false)).toEqual({
      operationSucceeded: false,
      announceSuccess: false,
      partialFailure: false,
    });
  });

  it('요청 순서대로 한 번씩 실행합니다', async () => {
    const coordinator = createSerializedMutationCoordinator();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const waitForFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = coordinator.run(async (revision) => {
      order.push(`start:${revision}`);
      await waitForFirst;
      order.push(`end:${revision}`);
      return 'first';
    });
    const second = coordinator.run(async (revision) => {
      order.push(`start:${revision}`);
      order.push(`end:${revision}`);
      return 'second';
    });

    await Promise.resolve();
    expect(order).toEqual(['start:1']);
    expect(coordinator.getRequestedRevision()).toBe(2);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
    expect(coordinator.getCompletedRevision()).toBe(2);
  });

  it('앞선 변경이 실패해도 다음 변경을 계속 실행합니다', async () => {
    const coordinator = createSerializedMutationCoordinator();
    const failed = coordinator.run(async () => {
      throw new Error('저장 실패');
    });
    const succeeded = coordinator.run(async (revision) => revision);

    await expect(failed).rejects.toThrow('저장 실패');
    await expect(succeeded).resolves.toBe(2);
    expect(coordinator.getCompletedRevision()).toBe(2);
  });
});

describe('알람 선행시간 계약 마이그레이션', () => {
  it('새 데이터와 직렬화는 1439분을 넘는 값을 거부합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    shift(data, 'day').alarmMinutesBefore = MAX_ALARM_MINUTES_BEFORE + 1;

    expect(() => validateAndMigrateAppData(data)).toThrow('알람 시간 값이 올바르지 않아요');
    expect(() => serializeAppData(data)).toThrow('알람 시간 값이 올바르지 않아요');
    expect(() => exportAppDataToJson(data)).toThrow('알람 시간 값이 올바르지 않아요');
  });

  it('기존 저장 데이터의 초과 값은 안전한 110분으로 보정합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    shift(data, 'day').alarmMinutesBefore = 7 * 24 * 60;

    const parsed = parseAppDataJson(JSON.stringify(data));

    expect(shift(parsed.data, 'day').alarmMinutesBefore).toBe(DEFAULT_ALARM_MINUTES_BEFORE);
    expect(parsed.migratedFromVersion).toBeNull();
    expect(parsed.requiresPersistence).toBe(true);
  });

  it('기존 값도 이전 계약보다 크면 손상 데이터로 거부합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    shift(data, 'day').alarmMinutesBefore = 7 * 24 * 60 + 1;

    expect(() => parseAppDataJson(JSON.stringify(data))).toThrow(
      '알람 시간 값이 올바르지 않아요',
    );
  });

  it('보정한 현재 버전 저장본을 마이그레이션 대상으로 표시합니다', async () => {
    const storage = new MemoryStorage();
    const data = createDefaultAppData('2026-07-11');
    shift(data, 'night').alarmMinutesBefore = MAX_ALARM_MINUTES_BEFORE + 1;
    storage.values.set(APP_DATA_STORAGE_KEY, JSON.stringify(data));

    const result = await loadAppDataFromStorage(storage);

    expect(result.ok).toBe(true);
    expect(result.ok && result.source).toBe('migrated');
    expect(result.ok && result.persistedSnapshot).toBeNull();
    expect(result.ok && shift(result.data, 'night').alarmMinutesBefore).toBe(
      DEFAULT_ALARM_MINUTES_BEFORE,
    );
  });

  it('1439분 이하는 보정 없이 유지합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    shift(data, 'day').alarmMinutesBefore = MAX_ALARM_MINUTES_BEFORE;

    const parsed = parseAppDataJson(JSON.stringify(data));

    expect(shift(parsed.data, 'day').alarmMinutesBefore).toBe(MAX_ALARM_MINUTES_BEFORE);
    expect(parsed.requiresPersistence).toBe(false);
  });
});

function legacyShiftTypes(current: AppData, includeSubstitute: boolean) {
  const base = current.shiftTypes.filter(
    (shift) => shift.id !== 'substitute-day' && shift.id !== 'substitute-night',
  );
  if (!includeSubstitute) return base;

  const substituteDay = current.shiftTypes.find((shift) => shift.id === 'substitute-day');
  if (!substituteDay) throw new Error('주간 대체근무 테스트 자료가 없습니다.');
  const substitute = {
    ...substituteDay,
    id: 'substitute',
    name: '대체근무',
    shortName: '대',
    alarmMinutesBefore: 90,
  };
  const offIndex = base.findIndex((shift) => shift.id === 'off');
  const insertAt = offIndex < 0 ? base.length : offIndex;
  return [...base.slice(0, insertAt), substitute, ...base.slice(insertAt)];
}

function createV1Data() {
  const current = createDefaultAppData('2026-07-11');
  const {
    timeOverrides: _timeOverrides,
    dayExceptions: _dayExceptions,
    ...legacyCurrent
  } = current;
  const {
    setupCompleted: _setupCompleted,
    themeMode: _themeMode,
    ...settings
  } = current.settings;
  return {
    ...legacyCurrent,
    version: 1,
    shiftTypes: legacyShiftTypes(current, false)
      .map((shift) =>
        shift.id === 'day'
          ? {
              ...shift,
              startMinutes: 8 * 60,
              endMinutes: 20 * 60,
              alarmMinutesBefore: 90,
            }
          : shift.id === 'night'
            ? { ...shift, startMinutes: 20 * 60, endMinutes: 8 * 60 }
            : shift,
      ),
    overrides: { '2026-07-12': 'night' },
    notes: { '2026-07-12': '개인 메모' },
    settings: { ...settings, notificationsEnabled: true, scheduledNotificationCount: 3 },
  };
}

function createV2Data() {
  const current = createDefaultAppData('2026-07-11');
  const {
    timeOverrides: _timeOverrides,
    dayExceptions: _dayExceptions,
    ...legacyCurrent
  } = current;
  const { themeMode: _themeMode, ...settings } = current.settings;
  return {
    ...legacyCurrent,
    version: 2,
    shiftTypes: legacyShiftTypes(current, false)
      .map((shift) =>
        shift.id === 'day'
          ? {
              ...shift,
              startMinutes: 9 * 60,
              endMinutes: 17 * 60,
              alarmMinutesBefore: 90,
            }
          : shift.id === 'night'
            ? { ...shift, startMinutes: 17 * 60, endMinutes: 9 * 60 }
            : shift,
      ),
    overrides: { '2026-07-13': 'day' },
    notes: { '2026-07-13': 'v2 메모' },
    settings: { ...settings, notificationsEnabled: true, setupCompleted: true },
  };
}

function createV3Data() {
  const current = createDefaultAppData('2026-07-11');
  const {
    timeOverrides: _timeOverrides,
    dayExceptions: _dayExceptions,
    ...legacyCurrent
  } = current;
  const { themeMode: _themeMode, ...settings } = current.settings;
  return {
    ...legacyCurrent,
    version: 3,
    shiftTypes: legacyShiftTypes(current, true).map((item) =>
      item.id === 'day' ? { ...item, alarmMinutesBefore: 90 } : item,
    ),
    overrides: { '2026-07-14': 'substitute' },
    notes: { '2026-07-14': 'v3 메모' },
    settings: { ...settings, notificationsEnabled: true, setupCompleted: true },
  };
}

function createV4Data() {
  const current = createDefaultAppData('2026-07-11');
  const {
    timeOverrides: _timeOverrides,
    dayExceptions: _dayExceptions,
    ...legacyCurrent
  } = current;
  const { themeMode: _themeMode, ...settings } = current.settings;
  return {
    ...legacyCurrent,
    version: 4,
    shiftTypes: legacyShiftTypes(current, true),
    overrides: { '2026-07-15': 'substitute' },
    notes: { '2026-07-15': 'v4 메모' },
    settings: { ...settings, notificationsEnabled: true, setupCompleted: true },
  };
}

function createV5Data() {
  const current = createDefaultAppData('2026-07-11');
  const {
    timeOverrides: _timeOverrides,
    dayExceptions: _dayExceptions,
    ...legacyCurrent
  } = current;
  const { themeMode: _themeMode, ...settings } = current.settings;
  return {
    ...legacyCurrent,
    version: 5,
    overrides: { '2026-07-16': 'night' },
    notes: { '2026-07-16': 'v5 메모' },
    settings: { ...settings, notificationsEnabled: true, setupCompleted: true },
  };
}

function createV6Data() {
  const current = createDefaultAppData('2026-07-11');
  const { dayExceptions: _dayExceptions, ...legacyCurrent } = current;
  return {
    ...legacyCurrent,
    version: 6,
  };
}

function createV8ToV11Data(version: 8 | 9 | 10 | 11) {
  const current = createDefaultAppData('2026-07-11');
  const {
    workRoutineProfiles: _workRoutineProfiles,
    widgetDisplayOptions: _widgetDisplayOptions,
    ...settings
  } = current.settings;
  return {
    ...current,
    version,
    overrides: { '2026-07-12': 'night' },
    timeOverrides: {
      '2026-07-12': {
        shiftTypeId: 'night',
        startMinutes: 19 * 60,
        endMinutes: 7 * 60,
        endsNextDay: true,
      },
    },
    dayExceptions: { '2026-07-13': 'training' },
    notes: { '2026-07-12': `v${version} 메모` },
    settings,
  };
}

function createV16Data() {
  const current = createDefaultAppData('2026-07-11');
  return {
    ...current,
    version: 16,
    settings: {
      ...current.settings,
      widgetDisplayOptions: {
        todayShift: false,
        nextShift: true,
        nextAlarm: true,
      },
    },
  };
}

function createV17Data() {
  const current = createDefaultAppData('2026-07-11');
  const { sleepReminderEnabled: _sleepReminderEnabled, ...settings } =
    current.settings;
  return {
    ...current,
    version: 17,
    settings,
  };
}

function createV18Data(sleepReminderEnabled: boolean) {
  const current = createDefaultAppData('2026-07-11');
  const { alarmOverrides: _alarmOverrides, ...data } = current;
  return {
    ...data,
    version: 18,
    settings: {
      ...current.settings,
      sleepReminderEnabled,
    },
  };
}

function shift(data: AppData, id: string) {
  const value = data.shiftTypes.find((item) => item.id === id);
  expect(value).toBeDefined();
  return value!;
}

const DEFAULT_ALARM_SHIFT_IDS = [
  'day',
  'night',
  'substitute-day',
  'substitute-night',
] as const;

describe('중간 데이터 버전 회귀', () => {
  it.each([8, 9, 10, 11] as const)(
    'v%s의 근무 변경·시간·예외·메모를 v19로 보존해요',
    (version) => {
      const parsed = validateAndMigrateAppData(createV8ToV11Data(version));

      expect(parsed.migratedFromVersion).toBe(version);
      expect(parsed.requiresPersistence).toBe(true);
      expect(parsed.data).toMatchObject({
        version: 20,
        overrides: { '2026-07-12': 'night' },
        timeOverrides: {
          '2026-07-12': {
            shiftTypeId: 'night',
            startMinutes: 19 * 60,
            endMinutes: 7 * 60,
            endsNextDay: true,
          },
        },
        dayExceptions: { '2026-07-13': 'training' },
        notes: { '2026-07-12': `v${version} 메모` },
      });
      expect(parsed.data.settings.workRoutineProfiles).toEqual(
        createDefaultAppData('2026-07-11').settings.workRoutineProfiles,
      );
      expect(parsed.data.settings.widgetDisplayOptions).toEqual({
        todayShift: true,
        nextShift: true,
        nextAlarm: false,
      });
    },
  );

  it('v16의 출근 루틴과 위젯 표시 선택을 v19로 그대로 보존해요', () => {
    const source = createV16Data();
    const parsed = validateAndMigrateAppData(source);

    expect(parsed.migratedFromVersion).toBe(16);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.settings.workRoutineProfiles).toEqual(
      source.settings.workRoutineProfiles,
    );
    expect(parsed.data.settings.widgetDisplayOptions).toEqual(
      source.settings.widgetDisplayOptions,
    );
  });

  it('v17 자료는 수면 시작 알림을 끈 v19로 이전해요', () => {
    const parsed = validateAndMigrateAppData(createV17Data());

    expect(parsed.migratedFromVersion).toBe(17);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.settings.sleepReminderEnabled).toBe(false);
  });

  it.each([true, false])(
    'v18 자료의 수면 시작 알림 %s 선택을 보존하고 v19로 이전해요',
    (sleepReminderEnabled) => {
      const source = createV18Data(sleepReminderEnabled);
      const parsed = parseAppDataJson(JSON.stringify(source));

      expect(source).not.toHaveProperty('alarmOverrides');
      expect(parsed.migratedFromVersion).toBe(18);
      expect(parsed.requiresPersistence).toBe(true);
      expect(parsed.data.version).toBe(20);
      expect(parsed.data.settings.sleepReminderEnabled).toBe(
        sleepReminderEnabled,
      );
      expect(parsed.data.alarmOverrides).toEqual({});
    },
  );

  it('v18 자료에 수면 시작 알림 선택이 없으면 손상 데이터로 거절해요', () => {
    const missing = createV18Data(true) as unknown as {
      settings: Record<string, unknown>;
    };
    delete missing.settings.sleepReminderEnabled;
    expect(() => validateAndMigrateAppData(missing)).toThrow(
      '수면 시작 알림 사용 여부 값이 올바르지 않아요.',
    );
  });
});

function createV12AlarmData(changed: Partial<Record<(typeof DEFAULT_ALARM_SHIFT_IDS)[number], number>> = {}) {
  const current = createDefaultAppData('2026-07-11');
  return {
    ...current,
    version: 12,
    shiftTypes: current.shiftTypes.map((item) => {
      if (!DEFAULT_ALARM_SHIFT_IDS.includes(item.id as (typeof DEFAULT_ALARM_SHIFT_IDS)[number])) {
        return item;
      }
      return {
        ...item,
        alarmMinutesBefore:
          changed[item.id as (typeof DEFAULT_ALARM_SHIFT_IDS)[number]] ?? 120,
      };
    }),
  };
}

describe('v12 기본 알람 선행시간 이전', () => {
  it('기본 근무 네 종류가 모두 이전 기본값이면 110분으로 한 번 이전해요', () => {
    const parsed = validateAndMigrateAppData(createV12AlarmData());

    expect(parsed.migratedFromVersion).toBe(12);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.version).toBe(20);
    expect(
      DEFAULT_ALARM_SHIFT_IDS.map(
        (id) => shift(parsed.data, id).alarmMinutesBefore,
      ),
    ).toEqual(DEFAULT_ALARM_SHIFT_IDS.map(() => DEFAULT_ALARM_MINUTES_BEFORE));
  });

  it('한 종류라도 사용자가 바꾼 흔적이 있으면 네 값을 모두 그대로 보존해요', () => {
    const parsed = validateAndMigrateAppData(createV12AlarmData({ day: 90 }));

    expect(parsed.migratedFromVersion).toBe(12);
    expect(shift(parsed.data, 'day').alarmMinutesBefore).toBe(90);
    expect(shift(parsed.data, 'night').alarmMinutesBefore).toBe(120);
    expect(shift(parsed.data, 'substitute-day').alarmMinutesBefore).toBe(120);
    expect(shift(parsed.data, 'substitute-night').alarmMinutesBefore).toBe(120);
  });

  it('현재 버전에서 사용자가 저장한 120분 값은 다시 기본값으로 바꾸지 않아요', () => {
    const current = createDefaultAppData('2026-07-11');
    current.shiftTypes = current.shiftTypes.map((item) =>
      DEFAULT_ALARM_SHIFT_IDS.includes(item.id as (typeof DEFAULT_ALARM_SHIFT_IDS)[number])
        ? { ...item, alarmMinutesBefore: 120 }
        : item,
    );

    const parsed = validateAndMigrateAppData(current);

    expect(parsed.migratedFromVersion).toBeNull();
    expect(parsed.requiresPersistence).toBe(false);
    expect(
      DEFAULT_ALARM_SHIFT_IDS.map(
        (id) => shift(parsed.data, id).alarmMinutesBefore,
      ),
    ).toEqual(DEFAULT_ALARM_SHIFT_IDS.map(() => 120));
  });
});

describe('근무표 데이터 검증과 백업', () => {
  it('v14 자료에 출근 준비 시간과 위젯 표시 기본값을 채워 v19로 이전해요', () => {
    const current = createDefaultAppData('2026-07-11');
    const {
      workRoutineProfiles: _workRoutineProfiles,
      ...legacySettings
    } = current.settings;
    const legacy = {
      ...current,
      version: 14,
      settings: legacySettings,
    };

    const parsed = validateAndMigrateAppData(legacy);

    expect(parsed.migratedFromVersion).toBe(14);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.settings.workRoutineProfiles).toEqual({
      day: {
        departMinutesBefore: 60,
        arriveMinutesBefore: 45,
        handoverMinutesBefore: 15,
      },
      evening: {
        departMinutesBefore: 60,
        arriveMinutesBefore: 45,
        handoverMinutesBefore: 15,
      },
      night: {
        departMinutesBefore: 60,
        arriveMinutesBefore: 45,
        handoverMinutesBefore: 15,
      },
    });
    expect(parsed.data.settings.widgetDisplayOptions).toEqual({
      todayShift: true,
      nextShift: true,
      nextAlarm: false,
    });
  });

  it('v15 자료에 기존 위젯 구성과 같은 표시 기본값을 채워요', () => {
    const current = createDefaultAppData('2026-07-11');
    const {
      widgetDisplayOptions: _widgetDisplayOptions,
      ...legacySettings
    } = current.settings;

    const parsed = validateAndMigrateAppData({
      ...current,
      version: 15,
      settings: legacySettings,
    });

    expect(parsed.migratedFromVersion).toBe(15);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.settings.widgetDisplayOptions).toEqual({
      todayShift: true,
      nextShift: true,
      nextAlarm: false,
    });
  });

  it('위젯 표시 선택을 백업에 보존하고 모든 항목 해제는 거절해요', () => {
    const data = createDefaultAppData('2026-07-11');
    data.settings.widgetDisplayOptions = {
      todayShift: false,
      nextShift: false,
      nextAlarm: true,
    };

    expect(
      parseAppDataJson(serializeAppData(data)).data.settings.widgetDisplayOptions,
    ).toEqual(data.settings.widgetDisplayOptions);
    expect(() =>
      validateAndMigrateAppData({
        ...data,
        settings: {
          ...data.settings,
          widgetDisplayOptions: {
            todayShift: false,
            nextShift: false,
            nextAlarm: false,
          },
        },
      }),
    ).toThrow('위젯에는 한 가지 이상의 정보를 표시해 주세요.');
  });

  it('사용자 지정 출근 준비 시간을 저장하고 다시 불러와요', () => {
    const data = createDefaultAppData('2026-07-11');
    data.settings.workRoutineProfiles = {
      day: {
        departMinutesBefore: 90,
        arriveMinutesBefore: 55,
        handoverMinutesBefore: 20,
      },
      evening: {
        departMinutesBefore: 85,
        arriveMinutesBefore: 50,
        handoverMinutesBefore: 15,
      },
      night: {
        departMinutesBefore: 75,
        arriveMinutesBefore: 50,
        handoverMinutesBefore: 10,
      },
    };

    const parsed = parseAppDataJson(serializeAppData(data));

    expect(parsed.migratedFromVersion).toBeNull();
    expect(parsed.requiresPersistence).toBe(false);
    expect(parsed.data.settings.workRoutineProfiles).toEqual(
      data.settings.workRoutineProfiles,
    );
  });

  it.each([
    {
      label: '5분 단위가 아닌 값',
      timing: {
        departMinutesBefore: 61,
        arriveMinutesBefore: 45,
        handoverMinutesBefore: 15,
      },
    },
    {
      label: '출발과 도착 순서가 뒤바뀐 값',
      timing: {
        departMinutesBefore: 45,
        arriveMinutesBefore: 60,
        handoverMinutesBefore: 15,
      },
    },
    {
      label: '최대 범위를 넘는 값',
      timing: {
        departMinutesBefore: 360,
        arriveMinutesBefore: 45,
        handoverMinutesBefore: 15,
      },
    },
  ])('현재 자료의 $label은 거절해요', ({ timing }) => {
    const data = createDefaultAppData('2026-07-11');

    expect(() =>
      validateAndMigrateAppData({
        ...data,
        settings: {
          ...data.settings,
          workRoutineProfiles: {
            ...data.settings.workRoutineProfiles,
            day: timing,
          },
        },
      }),
    ).toThrow('주간 출근 루틴');
  });

  it('현재 자료에는 날짜별 근무 시간과 예외 일정 필드가 반드시 있어야 합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    const { timeOverrides: _timeOverrides, ...incomplete } = data;

    expect(() => validateAndMigrateAppData(incomplete)).toThrow('날짜별 근무 시간');
    const { dayExceptions: _dayExceptions, ...withoutExceptions } = data;
    expect(() => validateAndMigrateAppData(withoutExceptions)).toThrow('예외 일정');
  });

  it('v6 자료를 예외 일정이 있는 최신 자료로 안전하게 이전합니다', () => {
    const parsed = validateAndMigrateAppData(createV6Data());

    expect(parsed.migratedFromVersion).toBe(6);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.dayExceptions).toEqual({});
  });

  it('v5에서 허용한 102개 근무를 보존하고 canonical 오후 근무를 추가해요', () => {
    const data = createV5Data();
    const template = data.shiftTypes.find((item) => item.id === 'day');
    expect(template).toBeDefined();
    const extraCount = 102 - data.shiftTypes.length;
    const shiftTypes = [
      ...data.shiftTypes,
      ...Array.from({ length: extraCount }, (_, index) => ({
        ...template!,
        id: `extra-${index}`,
        name: `추가 근무 ${index}`,
        shortName: `추${index}`,
      })),
    ];

    const parsed = validateAndMigrateAppData({ ...data, shiftTypes });

    expect(parsed.migratedFromVersion).toBe(5);
    expect(parsed.data.shiftTypes).toHaveLength(103);
  });

  it('다른 시점의 백업을 적용할 때 현재 휴대폰과 무관한 예약 상태를 비워요', () => {
    const data = createDefaultAppData('2026-07-11');
    const restored = withoutAlarmRuntimeState({
      ...data,
      settings: {
        ...data.settings,
        notificationsEnabled: true,
        scheduledNotificationCount: 3,
        lastNotificationSyncAt: '2026-07-11T03:00:00.000Z',
      },
    });

    expect(restored.settings).toMatchObject({
      notificationsEnabled: true,
      scheduledNotificationCount: 0,
      lastNotificationSyncAt: null,
    });
  });

  it('새 근무표를 v19 다크 테마·실제 근무시간·110분 전 알람·고정 패턴으로 생성합니다', () => {
    const data = createDefaultAppData('2026-07-11');

    expect(data.version).toBe(20);
    expect(data.timeOverrides).toEqual({});
    expect(data.dayExceptions).toEqual({});
    expect(data.settings.setupCompleted).toBe(false);
    expect(data.settings.themeMode).toBe('dark');
    expect(data.settings.widgetDisplayOptions).toEqual({
      todayShift: true,
      nextShift: true,
      nextAlarm: false,
    });
    expect(data.pattern.shiftTypeIds).toEqual(['day', 'day', 'night', 'night', 'off', 'off']);
    expect(shift(data, 'day')).toMatchObject({
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: 17 * 60 + 45,
      endsNextDay: false,
      alarmEnabled: true,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(data, 'night')).toMatchObject({
      startMinutes: NIGHT_SHIFT_START_MINUTES,
      endMinutes: 6 * 60 + 45,
      endsNextDay: true,
      alarmEnabled: true,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(data, 'substitute-day')).toMatchObject({
      name: '주간 대체근무',
      shortName: '대주',
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: 17 * 60 + 45,
      endsNextDay: false,
      isOff: false,
      alarmEnabled: true,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(data, 'substitute-night')).toMatchObject({
      name: '야간 대체근무',
      shortName: '대야',
      startMinutes: NIGHT_SHIFT_START_MINUTES,
      endMinutes: 6 * 60 + 45,
      endsNextDay: true,
      isOff: false,
      alarmEnabled: true,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
  });

  it('연차·교육·예비군 예외 일정을 백업과 복원에서 보존합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    data.dayExceptions = {
      '2026-07-11': 'leave',
      '2026-07-12': 'training',
      '2026-07-13': 'reserve',
    };

    const parsed = parseAppDataJson(serializeAppData(data));

    expect(parsed.data.dayExceptions).toEqual(data.dayExceptions);
    const backupPreview = previewAppDataImport(exportAppDataToJson(data));
    expect(backupPreview.data.dayExceptions).toEqual(data.dayExceptions);
    expect(backupPreview.summary.changedDateCount).toBe(3);
  });

  it('v7의 출장·잔업은 제거하고 연차·교육·예비군과 날짜별 변경은 보존합니다', () => {
    const current = createDefaultAppData('2026-07-11');
    const legacyV7 = {
      ...current,
      version: 7,
      shiftTypes: current.shiftTypes.map((item) =>
        item.id === 'day' || item.id === 'substitute-day'
          ? {
              ...item,
              startMinutes: LEGACY_DAY_SHIFT_START_MINUTES,
              endMinutes: 18 * 60,
            }
          : item.id === 'night' || item.id === 'substitute-night'
            ? {
                ...item,
                startMinutes: LEGACY_NIGHT_SHIFT_START_MINUTES,
                endMinutes: 7 * 60,
              }
            : item,
      ),
      overrides: { '2026-07-13': 'night' },
      timeOverrides: {
        '2026-07-14': {
          shiftTypeId: 'day',
          startMinutes: 8 * 60,
          endMinutes: 19 * 60,
          endsNextDay: false,
        },
      },
      dayExceptions: {
        '2026-07-11': 'leave',
        '2026-07-12': 'training',
        '2026-07-15': 'reserve',
        '2026-07-13': 'business-trip',
        '2026-07-14': 'overtime',
      },
      notes: { '2026-07-14': '기존 메모' },
    };

    const parsed = validateAndMigrateAppData(legacyV7);

    expect(parsed.migratedFromVersion).toBe(7);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.version).toBe(20);
    expect(shift(parsed.data, 'day').endMinutes).toBe(17 * 60 + 45);
    expect(shift(parsed.data, 'night').endMinutes).toBe(6 * 60 + 45);
    expect(parsed.data.dayExceptions).toEqual({
      '2026-07-11': 'leave',
      '2026-07-12': 'training',
      '2026-07-15': 'reserve',
    });
    expect(parsed.data.overrides).toEqual({ '2026-07-13': 'night' });
    expect(parsed.data.timeOverrides['2026-07-14']).toMatchObject({
      startMinutes: 8 * 60,
      endMinutes: 19 * 60,
    });
    expect(parsed.data.notes['2026-07-14']).toBe('기존 메모');
  });

  it('v7의 기존 기본 시각만 실제 퇴근 시각으로 바꾸고 사용자 시각과 날짜별 변경은 보존합니다', () => {
    const current = createDefaultAppData('2026-07-11');
    const source = {
      ...current,
      version: 7,
      shiftTypes: current.shiftTypes.map((item) =>
        item.id === 'day'
          ? { ...item, startMinutes: 6 * 60 + 30, endMinutes: 16 * 60 + 30 }
          : item.id === 'night'
            ? { ...item, startMinutes: 19 * 60, endMinutes: 5 * 60 + 30 }
            : item.id === 'substitute-day'
              ? {
                  ...item,
                  startMinutes: LEGACY_DAY_SHIFT_START_MINUTES,
                  endMinutes: 18 * 60,
                }
              : item.id === 'substitute-night'
                ? {
                    ...item,
                    startMinutes: LEGACY_NIGHT_SHIFT_START_MINUTES,
                    endMinutes: 7 * 60,
                  }
                : item,
      ),
      timeOverrides: {
        '2026-07-13': {
          shiftTypeId: 'night',
          startMinutes: 20 * 60,
          endMinutes: 8 * 60 + 30,
          endsNextDay: true,
        },
      },
    };

    const parsed = validateAndMigrateAppData(source);

    expect(parsed.migratedFromVersion).toBe(7);
    expect(shift(parsed.data, 'day')).toMatchObject({
      startMinutes: 6 * 60 + 30,
      endMinutes: 16 * 60 + 30,
    });
    expect(shift(parsed.data, 'night')).toMatchObject({
      startMinutes: 19 * 60,
      endMinutes: 5 * 60 + 30,
      endsNextDay: true,
    });
    expect(shift(parsed.data, 'substitute-day').endMinutes).toBe(17 * 60 + 45);
    expect(shift(parsed.data, 'substitute-night').endMinutes).toBe(6 * 60 + 45);
    expect(parsed.data.timeOverrides['2026-07-13']).toEqual({
      shiftTypeId: 'night',
      startMinutes: 20 * 60,
      endMinutes: 8 * 60 + 30,
      endsNextDay: true,
    });
  });

  it('시작일이 없는 기존 데이터는 기준일을 첫 근무일로 안전하게 보완합니다', () => {
    const current = createDefaultAppData('2026-07-11');
    const { scheduleStartDate: _scheduleStartDate, ...legacyPattern } = current.pattern;
    const parsed = validateAndMigrateAppData({
      ...current,
      pattern: legacyPattern,
    });

    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.pattern.scheduleStartDate).toBe('2026-07-11');
  });

  it('첫 근무일 이전에는 반복 근무와 직접 변경 및 예외 일정을 만들지 않습니다', () => {
    const data = createDefaultAppData('2026-07-10');
    data.pattern.anchorDate = '2026-07-08';
    data.pattern.scheduleStartDate = '2026-07-10';
    data.overrides['2026-07-09'] = 'night';
    data.dayExceptions['2026-07-09'] = 'reserve';

    expect(resolveShiftFromAppData(data, '2026-07-09')).toBeNull();
    expect(resolveShiftFromAppData(data, '2026-07-10')?.id).toBe('night');
  });

  it('연차는 해당 날짜만 휴무로 계산하고 기존 근무와 변경 시간은 보존합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    data.timeOverrides['2026-07-11'] = {
      shiftTypeId: 'day',
      startMinutes: 8 * 60 + 30,
      endMinutes: 19 * 60,
      endsNextDay: false,
    };
    data.dayExceptions['2026-07-11'] = 'leave';

    expect(resolveShiftFromAppData(data, '2026-07-11')).toMatchObject({
      id: 'exception-leave',
      name: '연차',
      isOff: true,
      alarmEnabled: false,
    });

    delete data.dayExceptions['2026-07-11'];
    expect(resolveShiftFromAppData(data, '2026-07-11')).toMatchObject({
      id: 'day',
      startMinutes: 8 * 60 + 30,
      endMinutes: 19 * 60,
    });
  });

  it('교육·예비군은 원래 야간·휴무와 시간 변경 대신 주간 일정으로 계산합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    data.timeOverrides['2026-07-13'] = {
      shiftTypeId: 'night',
      startMinutes: 20 * 60,
      endMinutes: 8 * 60,
      endsNextDay: true,
    };
    data.dayExceptions['2026-07-13'] = 'training';
    data.dayExceptions['2026-07-15'] = 'reserve';

    expect(resolveEffectiveDayFromAppData(data, '2026-07-13')).toMatchObject({
      scheduleActive: true,
      dayException: 'training',
      scheduledShift: {
        id: 'night',
        startMinutes: 20 * 60,
        endMinutes: 8 * 60,
      },
      shift: {
        id: 'day',
        name: '주간',
        startMinutes: DAY_SHIFT_START_MINUTES,
        endMinutes: 17 * 60 + 45,
      },
    });
    expect(resolveEffectiveDayFromAppData(data, '2026-07-15')).toMatchObject({
      dayException: 'reserve',
      scheduledShift: { id: 'off' },
      shift: {
        id: 'day',
        startMinutes: DAY_SHIFT_START_MINUTES,
        endMinutes: 17 * 60 + 45,
      },
    });
  });

  it('알 수 없는 예외 일정 종류를 거절합니다', () => {
    const data = createDefaultAppData('2026-07-11');

    expect(() =>
      validateAndMigrateAppData({
        ...data,
        dayExceptions: { '2026-07-11': 'unknown' },
      }),
    ).toThrow('예외 일정 종류');
  });

  it('v1 일정·메모·알림 설정을 보존하면서 다크 테마로 변환합니다', () => {
    const parsed = validateAndMigrateAppData(createV1Data());

    expect(parsed.migratedFromVersion).toBe(1);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.timeOverrides).toEqual({});
    expect(parsed.data.overrides['2026-07-12']).toBe('night');
    expect(parsed.data.notes['2026-07-12']).toBe('개인 메모');
    expect(parsed.data.settings.notificationsEnabled).toBe(true);
    expect(parsed.data.settings.scheduledNotificationCount).toBe(3);
    expect(parsed.data.settings.setupCompleted).toBe(false);
    expect(parsed.data.settings.themeMode).toBe('dark');
    expect(shift(parsed.data, 'day')).toMatchObject({
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: 17 * 60 + 45,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(parsed.data, 'night')).toMatchObject({
      startMinutes: NIGHT_SHIFT_START_MINUTES,
      endMinutes: 6 * 60 + 45,
      endsNextDay: true,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(parsed.data, 'substitute-day').alarmEnabled).toBe(true);
    expect(shift(parsed.data, 'substitute-night').alarmEnabled).toBe(true);
  });

  it('v2 일정·메모·설정을 보존하고 근무시간과 대체근무를 한 번 갱신합니다', () => {
    const parsed = validateAndMigrateAppData(createV2Data());

    expect(parsed.migratedFromVersion).toBe(2);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.timeOverrides).toEqual({});
    expect(parsed.data.overrides).toEqual({ '2026-07-13': 'day' });
    expect(parsed.data.notes).toEqual({ '2026-07-13': 'v2 메모' });
    expect(parsed.data.settings.notificationsEnabled).toBe(true);
    expect(parsed.data.settings.setupCompleted).toBe(true);
    expect(shift(parsed.data, 'day')).toMatchObject({
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: 17 * 60 + 45,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(parsed.data, 'night')).toMatchObject({
      startMinutes: NIGHT_SHIFT_START_MINUTES,
      endMinutes: 6 * 60 + 45,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(parsed.data, 'substitute-day').shortName).toBe('대주');
    expect(shift(parsed.data, 'substitute-night').shortName).toBe('대야');
  });

  it('v1과 v2의 반복 순서는 고정 패턴으로 정규화하고 기준일은 보존합니다', () => {
    const legacy = {
      ...createV2Data(),
      pattern: {
        name: '기존 이름',
        anchorDate: '2026-06-30',
        shiftTypeIds: ['night', 'off', 'day'],
      },
    };

    const parsed = validateAndMigrateAppData(legacy);

    expect(parsed.data.pattern).toEqual({
      name: '3조 2교대 (주주야야휴휴)',
      anchorDate: '2026-06-30',
      scheduleStartDate: '2026-06-30',
      shiftTypeIds: ['day', 'day', 'night', 'night', 'off', 'off'],
    });
  });

  it('v3의 일정·설정·근무시간은 보존하고 기존 주간 기본 알람만 한 번 갱신합니다', () => {
    const source = createV3Data();
    source.shiftTypes = source.shiftTypes.map((item) =>
      item.id === 'day'
        ? { ...item, startMinutes: 6 * 60, endMinutes: 15 * 60 }
        : item.id === 'night'
          ? {
              ...item,
              startMinutes: 19 * 60,
              endMinutes: 8 * 60,
              alarmMinutesBefore: 45,
            }
          : item,
    );

    const parsed = validateAndMigrateAppData(source);

    expect(parsed.migratedFromVersion).toBe(3);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.overrides).toEqual({ '2026-07-14': 'substitute-day' });
    expect(parsed.data.notes).toEqual({ '2026-07-14': 'v3 메모' });
    expect(parsed.data.settings.notificationsEnabled).toBe(true);
    expect(shift(parsed.data, 'day')).toMatchObject({
      startMinutes: 360,
      endMinutes: 900,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(parsed.data, 'night')).toMatchObject({
      startMinutes: 1_140,
      endMinutes: 480,
      endsNextDay: true,
      alarmMinutesBefore: 45,
    });
  });

  it('v4의 대체근무 편집값은 주간 대체근무에 보존하고 야간 대체근무는 기본값으로 만듭니다', () => {
    const source = createV4Data();
    const edited = {
      ...source,
      shiftTypes: source.shiftTypes.map((item) =>
        item.id === 'day'
          ? {
              ...item,
              startMinutes: 360,
              endMinutes: 900,
              alarmMinutesBefore: 90,
            }
          : item.id === 'substitute'
            ? {
                ...item,
                startMinutes: 600,
                endMinutes: 1_200,
                alarmMinutesBefore: 45,
              }
            : item,
      ),
    };

    const parsed = validateAndMigrateAppData(edited);

    expect(parsed.migratedFromVersion).toBe(4);
    expect(shift(parsed.data, 'day')).toMatchObject({
      startMinutes: 360,
      endMinutes: 900,
      alarmMinutesBefore: 90,
    });
    expect(shift(parsed.data, 'substitute-day')).toMatchObject({
      startMinutes: 600,
      endMinutes: 1_200,
      alarmMinutesBefore: 45,
    });
    expect(shift(parsed.data, 'substitute-night')).toMatchObject({
      startMinutes: NIGHT_SHIFT_START_MINUTES,
      endMinutes: 6 * 60 + 45,
      endsNextDay: true,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(parsed.data.overrides).toEqual({ '2026-07-15': 'substitute-day' });
    expect(parsed.data.notes).toEqual({ '2026-07-15': 'v4 메모' });
    expect(parsed.data.settings.notificationsEnabled).toBe(true);
    expect(parsed.data.settings.themeMode).toBe('dark');
  });

  it('v3의 익일 종료 대체근무는 야간 대체근무로 이관합니다', () => {
    const source = createV3Data();
    const edited = {
      ...source,
      shiftTypes: source.shiftTypes.map((item) =>
        item.id === 'substitute'
          ? {
              ...item,
              startMinutes: 18 * 60,
              endMinutes: 7 * 60,
              endsNextDay: true,
              alarmMinutesBefore: 45,
            }
          : item,
      ),
    };

    const parsed = validateAndMigrateAppData(edited);

    expect(shift(parsed.data, 'substitute-day')).toMatchObject({
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: 17 * 60 + 45,
      endsNextDay: false,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(parsed.data, 'substitute-night')).toMatchObject({
      startMinutes: 18 * 60,
      endMinutes: 6 * 60 + 45,
      endsNextDay: true,
      alarmMinutesBefore: 45,
    });
    expect(parsed.data.overrides).toEqual({ '2026-07-14': 'substitute-night' });
  });

  it('v4의 야간 시작 시각 대체근무는 당일 종료여도 야간 대체근무로 이관합니다', () => {
    const source = createV4Data();
    const edited = {
      ...source,
      shiftTypes: source.shiftTypes.map((item) =>
        item.id === 'substitute'
          ? {
              ...item,
              startMinutes: 18 * 60,
              endMinutes: 23 * 60,
              endsNextDay: false,
              alarmMinutesBefore: 60,
            }
          : item,
      ),
    };

    const parsed = validateAndMigrateAppData(edited);

    expect(shift(parsed.data, 'substitute-day')).toMatchObject({
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: 17 * 60 + 45,
      endsNextDay: false,
      alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE,
    });
    expect(shift(parsed.data, 'substitute-night')).toMatchObject({
      startMinutes: 18 * 60,
      endMinutes: 23 * 60,
      endsNextDay: false,
      alarmMinutesBefore: 60,
    });
    expect(parsed.data.overrides).toEqual({ '2026-07-15': 'substitute-night' });
  });

  it('테마 필드가 없는 기존 v5 일정·메모·설정을 보존하면서 다크 테마를 추가합니다', () => {
    const parsed = validateAndMigrateAppData(createV5Data());

    expect(parsed.migratedFromVersion).toBe(5);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.timeOverrides).toEqual({});
    expect(parsed.data.overrides).toEqual({ '2026-07-16': 'night' });
    expect(parsed.data.notes).toEqual({ '2026-07-16': 'v5 메모' });
    expect(parsed.data.settings.notificationsEnabled).toBe(true);
    expect(parsed.data.settings.setupCompleted).toBe(true);
    expect(parsed.data.settings.themeMode).toBe('dark');
  });

  it('지원하는 v5 반복 순서는 다시 저장 가능한 v9 데이터로 변환합니다', () => {
    const parsed = validateAndMigrateAppData(createV5Data());
    const roundTrip = parseAppDataJson(serializeAppData(parsed.data));

    expect(roundTrip.data).toEqual(parsed.data);
  });

  it('지원하지 않는 v5 반복 순서는 v9 데이터로 변환하지 않습니다', () => {
    const data = createV5Data();

    expect(() =>
      validateAndMigrateAppData({
        ...data,
        pattern: {
          ...data.pattern,
          shiftTypeIds: ['day', 'night', 'off'],
        },
      }),
    ).toThrow('지원하는 근무 방식은 3조 2교대 또는 주간 고정이에요.');
  });

  it('새 프리셋과 우연히 같은 구버전 순서도 v20 이전에는 허용하지 않아요', () => {
    const data = createV5Data();

    expect(() =>
      validateAndMigrateAppData({
        ...data,
        pattern: { ...data.pattern, shiftTypeIds: ['day', 'night'] },
      }),
    ).toThrow('지원하는 근무 방식은 3조 2교대 또는 주간 고정이에요.');
  });

  it('기존 휴대폰의 반복 근무 이름을 새 표기로 통일합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    const parsed = validateAndMigrateAppData({
      ...data,
      pattern: { ...data.pattern, name: '3조 2교대 주주야야휴휴' },
    });

    expect(parsed.migratedFromVersion).toBeNull();
    expect(parsed.data.pattern.name).toBe('3조 2교대 (주주야야휴휴)');
  });

  it('v5 주간 고정과 다크 테마를 v9로 옮겨도 그대로 보존합니다', () => {
    const data = createV5Data();
    const parsed = validateAndMigrateAppData({
      ...data,
      shiftTypes: data.shiftTypes.map((shift) =>
        shift.id === 'day'
          ? { ...shift, startMinutes: 8 * 60, endMinutes: 17 * 60 }
          : shift,
      ),
      pattern: {
        name: '주간 근무',
        anchorDate: '2026-07-11',
        shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
      },
      settings: { ...data.settings, themeMode: 'dark' },
    });

    expect(parsed.migratedFromVersion).toBe(5);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.pattern).toEqual({
      name: '주간 고정',
      anchorDate: '2026-07-11',
      scheduleStartDate: '2026-07-11',
      shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
    });
    expect(parsed.data.shiftTypes.find((shift) => shift.id === 'day')).toMatchObject({
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: 17 * 60 + 45,
      endsNextDay: false,
    });
    expect(parsed.data.settings.themeMode).toBe('dark');
    expect(parsed.data.timeOverrides).toEqual({});
  });

  it('v19 주간 고정은 사용자가 바꾼 주간 시간을 canonical 저장과 다시 읽기에서 보존합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    data.pattern = {
      ...data.pattern,
      name: '주간 근무',
      shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
    };
    data.shiftTypes = data.shiftTypes.map((item) =>
      item.id === 'day'
        ? {
            ...item,
            startMinutes: 8 * 60 + 10,
            endMinutes: 16 * 60 + 40,
            endsNextDay: false,
          }
        : item,
    );

    const canonical = canonicalizeAppData(data);
    const snapshot = serializeAppData(data);
    const reloaded = parseAppDataJson(snapshot).data;

    expect(shift(canonical, 'day')).toMatchObject({
      startMinutes: 8 * 60 + 10,
      endMinutes: 16 * 60 + 40,
      endsNextDay: false,
    });
    expect(snapshot).toBe(JSON.stringify(canonical));
    expect(reloaded).toEqual(canonical);
  });

  it('v19 자료의 패턴과 기존 시간을 보존하고 오후 근무만 비활성 상태로 추가해요', () => {
    const current = createDefaultAppData('2026-07-11');
    const existingShiftTypes = current.shiftTypes
      .filter((item) => item.id !== 'evening')
      .map((item, index) =>
        item.isOff
          ? item
          : {
              ...item,
              startMinutes: item.startMinutes! + index * 5,
              endMinutes: item.endMinutes! + index * 5,
            },
      );
    const { evening: _evening, ...legacyProfiles } =
      current.settings.workRoutineProfiles;
    const legacyV19 = {
      ...current,
      version: 19,
      shiftTypes: existingShiftTypes,
      pattern: {
        ...current.pattern,
        name: '주간 근무',
        shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
      },
      settings: {
        ...current.settings,
        workRoutineProfiles: legacyProfiles,
      },
    };

    const parsed = validateAndMigrateAppData(legacyV19);

    expect(parsed.migratedFromVersion).toBe(19);
    expect(parsed.requiresPersistence).toBe(true);
    expect(parsed.data.version).toBe(20);
    expect(parsed.data.pattern).toEqual({
      ...legacyV19.pattern,
      name: '주간 고정',
    });
    for (const existing of existingShiftTypes) {
      expect(shift(parsed.data, existing.id)).toMatchObject({
        startMinutes: existing.startMinutes,
        endMinutes: existing.endMinutes,
        endsNextDay: existing.endsNextDay,
        alarmMinutesBefore: existing.alarmMinutesBefore,
      });
    }
    expect(parsed.data.pattern.shiftTypeIds).not.toContain('evening');
    expect(shift(parsed.data, 'evening')).toMatchObject({
      startMinutes: 15 * 60,
      endMinutes: 23 * 60,
      endsNextDay: false,
    });
    expect(parsed.data.settings.workRoutineProfiles.evening).toEqual(
      legacyProfiles.day,
    );
  });

  it('v19의 휴무 evening ID 충돌을 결정적으로 옮기고 재로드해요', () => {
    const current = createDefaultAppData('2026-07-11');
    const { evening: _eveningRoutine, ...legacyProfiles } =
      current.settings.workRoutineProfiles;
    const occupiedCompatibilityId = {
      ...shift(current, 'day'),
      id: 'legacy-evening',
      name: '기존 사용자 근무',
      shortName: '기존',
    };
    const legacyEveningOff = {
      ...shift(current, 'off'),
      id: 'evening',
      name: '기존 오후 휴무',
      shortName: '오휴',
    };
    const legacyV19 = {
      ...current,
      version: 19,
      shiftTypes: [
        ...current.shiftTypes.filter((item) => item.id !== 'evening'),
        occupiedCompatibilityId,
        legacyEveningOff,
      ],
      settings: {
        ...current.settings,
        workRoutineProfiles: legacyProfiles,
      },
    };

    const migrated = validateAndMigrateAppData(legacyV19).data;
    const reloaded = parseAppDataJson(serializeAppData(migrated)).data;

    expect(shift(migrated, 'legacy-evening')).toMatchObject({
      name: '기존 사용자 근무',
      isOff: false,
    });
    expect(shift(migrated, 'legacy-evening-2')).toMatchObject({
      name: '기존 오후 휴무',
      shortName: '오휴',
      isOff: true,
      startMinutes: null,
      endMinutes: null,
      alarmEnabled: false,
    });
    expect(shift(migrated, 'evening')).toMatchObject({
      startMinutes: 15 * 60,
      endMinutes: 23 * 60,
      endsNextDay: false,
      isOff: false,
    });
    expect(reloaded).toEqual(migrated);
  });

  it('v19 evening의 반복·날짜·시간 참조와 알람 값을 같은 ID로 보존해요', () => {
    const current = createDefaultAppData('2026-07-11');
    const { evening: _eveningRoutine, ...legacyProfiles } =
      current.settings.workRoutineProfiles;
    const occupiedCompatibilityId = {
      ...shift(current, 'day'),
      id: 'legacy-evening',
      name: '이미 있던 호환 ID',
      shortName: '호환',
    };
    const legacyEveningShift = {
      ...shift(current, 'day'),
      id: 'evening',
      name: '기존 석간 근무',
      shortName: '석',
      startMinutes: 12 * 60 + 10,
      endMinutes: 20 * 60 + 40,
      endsNextDay: false,
      alarmEnabled: true,
      alarmMinutesBefore: 95,
    };
    const legacyV19 = {
      ...current,
      version: 19,
      shiftTypes: [
        ...current.shiftTypes.filter((item) => item.id !== 'evening'),
        occupiedCompatibilityId,
        legacyEveningShift,
      ],
      pattern: {
        name: '기존 사용자 순환',
        anchorDate: '2026-07-11',
        scheduleStartDate: '2026-07-11',
        shiftTypeIds: ['evening', 'off'],
      },
      overrides: { '2026-07-13': 'evening' },
      timeOverrides: {
        '2026-07-13': {
          shiftTypeId: 'evening',
          startMinutes: 13 * 60,
          endMinutes: 21 * 60 + 5,
          endsNextDay: false,
        },
      },
      alarmOverrides: { '2026-07-13': { mode: 'disabled' } },
      settings: {
        ...current.settings,
        workRoutineProfiles: legacyProfiles,
      },
    };

    const migrated = validateAndMigrateAppData(legacyV19).data;
    const reloaded = parseAppDataJson(serializeAppData(migrated)).data;

    expect(shift(migrated, 'legacy-evening-2')).toMatchObject({
      name: '기존 석간 근무',
      shortName: '석',
      startMinutes: 12 * 60 + 10,
      endMinutes: 20 * 60 + 40,
      alarmEnabled: true,
      alarmMinutesBefore: 95,
    });
    expect(migrated.pattern).toMatchObject({
      name: '기존 사용자 순환',
      shiftTypeIds: ['legacy-evening-2', 'off'],
    });
    expect(migrated.overrides).toEqual({
      '2026-07-13': 'legacy-evening-2',
    });
    expect(migrated.timeOverrides).toEqual({
      '2026-07-13': {
        shiftTypeId: 'legacy-evening-2',
        startMinutes: 13 * 60,
        endMinutes: 21 * 60 + 5,
        endsNextDay: false,
      },
    });
    expect(migrated.alarmOverrides).toEqual({
      '2026-07-13': { mode: 'disabled' },
    });
    expect(resolveShiftFromAppData(migrated, '2026-07-11')).toMatchObject({
      id: 'legacy-evening-2',
      startMinutes: 12 * 60 + 10,
      endMinutes: 20 * 60 + 40,
    });
    expect(resolveShiftFromAppData(migrated, '2026-07-13')).toMatchObject({
      id: 'legacy-evening-2',
      startMinutes: 13 * 60,
      endMinutes: 21 * 60 + 5,
    });
    expect(reloaded).toEqual(migrated);
  });

  it('v20은 1~42일 사용자 순서를 허용하고 휴무뿐인 순서는 거절해요', () => {
    const data = createDefaultAppData('2026-07-11');
    const custom = validateAndMigrateAppData({
      ...data,
      pattern: {
        ...data.pattern,
        name: '우리 회사 순서',
        shiftTypeIds: ['day', 'evening', 'night', 'off', 'off'],
      },
    });

    expect(custom.data.pattern).toMatchObject({
      name: '우리 회사 순서',
      shiftTypeIds: ['day', 'evening', 'night', 'off', 'off'],
    });
    expect(() =>
      validateAndMigrateAppData({
        ...data,
        pattern: { ...data.pattern, name: '휴무뿐', shiftTypeIds: ['off'] },
      }),
    ).toThrow('기타 근무 순서는 1~42일');
    expect(() =>
      validateAndMigrateAppData({
        ...data,
        pattern: {
          ...data.pattern,
          name: '너무 긴 순서',
          shiftTypeIds: Array.from({ length: 43 }, () => 'day'),
        },
      }),
    ).toThrow('기타 근무 순서는 1~42일');
  });

  it('exact weekday 사용자 순서는 저장과 재로드 뒤에도 적용일 요일을 사용해요', () => {
    const data = createDefaultAppData('2026-07-11');
    data.pattern = createWorkPatternFromReference({
      presetId: 'custom',
      name: '사용자 주간 순서',
      shiftTypeIds: WEEKDAY_PATTERN_SHIFT_TYPE_IDS,
      referenceDate: '2026-07-15',
      scheduleStartDate: '2026-07-18',
      position: 2,
    });

    const reloaded = parseAppDataJson(serializeAppData(data)).data;

    expect(reloaded.pattern).toMatchObject({
      name: '주간 고정',
      anchorDate: '2026-07-13',
      scheduleStartDate: '2026-07-18',
    });
    expect(resolveShiftFromAppData(reloaded, '2026-07-18')?.id).toBe('off');
    expect(resolveShiftFromAppData(reloaded, '2026-07-20')?.id).toBe('day');
  });

  it('v3과 v4 데이터에서는 주간 고정 근무 방식을 허용하지 않습니다', () => {
    for (const source of [createV3Data(), createV4Data()]) {
      expect(() =>
        validateAndMigrateAppData({
          ...source,
          pattern: {
            ...source.pattern,
            shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
          },
        }),
      ).toThrow('이전 데이터 버전은 3조 2교대 근무 방식만 지원해요.');
    }
  });

  it('주간 고정은 기준일과 무관하게 실제 평일과 주말로 계산합니다', () => {
    const current = createDefaultAppData('2026-07-11');
    const data: AppData = {
      ...current,
      pattern: {
        name: '주간 고정',
        // 반복 기준일과 별개로 월요일부터 일정을 시작해 실제 요일 계산을 검증합니다.
        anchorDate: '2026-07-11',
        scheduleStartDate: '2026-07-06',
        shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
      },
    };

    expect(resolveShiftFromAppData(data, '2026-07-06')?.id).toBe('day');
    expect(resolveShiftFromAppData(data, '2026-07-10')?.id).toBe('day');
    expect(resolveShiftFromAppData(data, '2026-07-11')?.id).toBe('off');
    expect(resolveShiftFromAppData(data, '2026-07-12')?.id).toBe('off');
  });

  it('주간 고정에서도 직접 변경한 날짜가 기본 요일 규칙보다 우선합니다', () => {
    const current = createDefaultAppData('2026-07-11');
    const data: AppData = {
      ...current,
      pattern: {
        name: '주간 고정',
        anchorDate: '2026-07-11',
        scheduleStartDate: '2026-07-06',
        shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
      },
      overrides: {
        '2026-07-08': 'night',
        '2026-07-11': 'day',
        '2026-07-12': null,
      },
    };

    expect(resolveShiftFromAppData(data, '2026-07-08')?.id).toBe('night');
    expect(resolveShiftFromAppData(data, '2026-07-11')?.id).toBe('day');
    expect(resolveShiftFromAppData(data, '2026-07-12')).toBeNull();
  });

  it('날짜별 근무 시간은 해당 날짜에만 적용하고 기본 근무 종류는 바꾸지 않습니다', () => {
    const data: AppData = {
      ...createDefaultAppData('2026-07-11'),
      timeOverrides: {
        '2026-07-11': {
          shiftTypeId: 'day',
          startMinutes: 8 * 60 + 30,
          endMinutes: 19 * 60,
          endsNextDay: false,
        },
        '2026-07-13': {
          shiftTypeId: 'night',
          startMinutes: 20 * 60,
          endMinutes: 9 * 60,
          endsNextDay: true,
        },
      },
    };

    expect(resolveShiftFromAppData(data, '2026-07-11')).toMatchObject({
      id: 'day',
      startMinutes: 8 * 60 + 30,
      endMinutes: 19 * 60,
      endsNextDay: false,
    });
    expect(resolveShiftFromAppData(data, '2026-07-12')).toMatchObject({
      id: 'day',
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: 17 * 60 + 45,
      endsNextDay: false,
    });
    expect(resolveShiftFromAppData(data, '2026-07-13')).toMatchObject({
      id: 'night',
      startMinutes: 20 * 60,
      endMinutes: 9 * 60,
      endsNextDay: true,
    });
    expect(shift(data, 'day')).toMatchObject({
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: 17 * 60 + 45,
      endsNextDay: false,
    });
  });

  it('근무 종류가 달라진 날짜에는 오래된 시간 변경을 적용하지 않습니다', () => {
    const data: AppData = {
      ...createDefaultAppData('2026-07-11'),
      overrides: { '2026-07-11': 'night' },
      timeOverrides: {
        '2026-07-11': {
          shiftTypeId: 'day',
          startMinutes: 9 * 60,
          endMinutes: 17 * 60,
          endsNextDay: false,
        },
      },
    };

    expect(resolveShiftFromAppData(data, '2026-07-11')).toMatchObject({
      id: 'night',
      startMinutes: NIGHT_SHIFT_START_MINUTES,
      endMinutes: 6 * 60 + 45,
      endsNextDay: true,
    });
  });

  it('날짜별 시간의 익일 종료 여부가 시각과 다르면 거절합니다', () => {
    const data = createDefaultAppData('2026-07-11');

    expect(() =>
      validateAndMigrateAppData({
        ...data,
        timeOverrides: {
          '2026-07-13': {
            shiftTypeId: 'night',
            startMinutes: 20 * 60,
            endMinutes: 9 * 60,
            endsNextDay: false,
          },
        },
      }),
    ).toThrow('익일 종료 여부가 근무 시간과 맞지 않아요');
  });

  it('v1부터 v5까지 테마가 없던 자료를 모두 다크 모드로 이전합니다', () => {
    const legacyData = [
      createV1Data(),
      createV2Data(),
      createV3Data(),
      createV4Data(),
      createV5Data(),
    ];

    for (const source of legacyData) {
      expect(validateAndMigrateAppData(source).data.settings.themeMode).toBe('dark');
    }
  });

  it('v5에서 사용자가 편집한 근무시간·알람·다크 테마를 v9에서도 보존합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    const { timeOverrides: _timeOverrides, ...legacyData } = data;
    const edited = {
      ...legacyData,
      version: 5,
      shiftTypes: data.shiftTypes.map((item) =>
        item.id === 'substitute-night'
          ? {
              ...item,
              startMinutes: 1_140,
              endMinutes: 480,
              alarmMinutesBefore: 75,
            }
          : item,
      ),
      settings: { ...data.settings, themeMode: 'dark' },
    };

    const parsed = validateAndMigrateAppData(edited);

    expect(parsed.migratedFromVersion).toBe(5);
    expect(parsed.data.version).toBe(20);
    expect(shift(parsed.data, 'substitute-night')).toMatchObject({
      startMinutes: 1_140,
      endMinutes: 480,
      alarmMinutesBefore: 75,
    });
    expect(parsed.data.settings.themeMode).toBe('dark');
    expect(parsed.data.timeOverrides).toEqual({});
  });

  it('v1의 익일 종료 값이 시간과 달라도 시간 기준으로 바로잡습니다', () => {
    const legacy = createV1Data();
    legacy.shiftTypes = legacy.shiftTypes.map((item) =>
      item.id === 'night' ? { ...item, endsNextDay: false } : item,
    );

    const parsed = validateAndMigrateAppData(legacy);

    expect(shift(parsed.data, 'night').endsNextDay).toBe(true);
  });

  it('v9의 시간과 익일 종료가 다르거나 시작·종료가 같으면 거절합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    const wrongDay = data.shiftTypes.map((item) =>
      item.id === 'day' ? { ...item, endsNextDay: true } : item,
    );
    const sameTime = data.shiftTypes.map((item) =>
      item.id === 'night' ? { ...item, endMinutes: item.startMinutes } : item,
    );

    expect(() => validateAndMigrateAppData({ ...data, shiftTypes: wrongDay })).toThrow(
      '다음 날 종료 설정이 시간과 맞지 않아요',
    );
    expect(() => validateAndMigrateAppData({ ...data, shiftTypes: sameTime })).toThrow(
      '시작·종료 시간은 달라야 해요',
    );
  });

  it('v9에 필수 근무 종류나 고정 패턴이 없으면 거절합니다', () => {
    const data = createDefaultAppData('2026-07-11');

    expect(() =>
      validateAndMigrateAppData({
        ...data,
        shiftTypes: data.shiftTypes.filter((item) => item.id !== 'substitute-night'),
      }),
    ).toThrow('주간·야간 대체근무 기본 근무 종류');
    expect(() =>
      validateAndMigrateAppData({
        ...data,
        version: 9,
        shiftTypes: data.shiftTypes.filter((item) => item.id !== 'evening'),
        pattern: { ...data.pattern, shiftTypeIds: ['day', 'night', 'off'] },
      }),
    ).toThrow('지원하는 근무 방식은 3조 2교대 또는 주간 고정이에요.');
  });

  it('존재하지 않는 근무와 잘못된 날짜가 든 자료를 거절합니다', () => {
    const data = createDefaultAppData('2026-07-11');

    expect(() =>
      validateAndMigrateAppData({
        ...data,
        overrides: { '2026-07-12': 'unknown' },
      }),
    ).toThrow('알 수 없는 근무 종류');
    expect(() =>
      validateAndMigrateAppData({
        ...data,
        notes: { '2026-02-30': '존재하지 않는 날짜' },
      }),
    ).toThrow('날짜가 올바르지 않아요');
  });

  it('내보낸 JSON을 검증해 가져오기 요약과 데이터를 만듭니다', () => {
    const data: AppData = {
      ...createDefaultAppData('2026-07-11'),
      overrides: { '2026-07-12': 'substitute-night' },
      timeOverrides: {
        // 같은 날짜의 근무·시간 변경은 한 날짜로 계산해야 합니다.
        '2026-07-12': {
          shiftTypeId: 'substitute-night',
          startMinutes: 19 * 60,
          endMinutes: 8 * 60,
          endsNextDay: true,
        },
        // 시간만 바꾼 날짜도 변경 날짜에 포함해야 합니다.
        '2026-07-13': {
          shiftTypeId: 'night',
          startMinutes: 20 * 60,
          endMinutes: 9 * 60,
          endsNextDay: true,
        },
      },
      notes: { '2026-07-12': '메모' },
      settings: { ...createDefaultAppData('2026-07-11').settings, themeMode: 'dark' },
    };
    const exported = exportAppDataToJson(data, new Date('2026-07-11T12:00:00.000Z'));
    const preview = previewAppDataImport(exported);

    expect(preview.exportedAt).toBe('2026-07-11T12:00:00.000Z');
    expect(preview.summary).toMatchObject({
      patternName: '3조 2교대 (주주야야휴휴)',
      anchorDate: '2026-07-11',
      scheduleStartDate: '2026-07-11',
      shiftTypeCount: 6,
      changedDateCount: 2,
      noteCount: 1,
    });
    expect(appDataFromImportPreview(preview)).toEqual(data);
  });

  it('편집기가 UTF-8 BOM을 붙인 정상 백업도 읽습니다', () => {
    const data = createDefaultAppData('2026-07-11');
    const exported = exportAppDataToJson(data, new Date('2026-07-11T12:00:00.000Z'));

    expect(previewAppDataImport(`\uFEFF${exported}`).data).toEqual(data);
    expect(parseAppDataJson(`\uFEFF${JSON.stringify(data)}`).data).toEqual(data);
  });

  it('백업 봉투가 없는 기존 v2 JSON도 미리보기에서 변환합니다', () => {
    const preview = previewAppDataImport(JSON.stringify(createV2Data()));

    expect(preview.source).toBe('data');
    expect(preview.migratedFromVersion).toBe(2);
    expect(preview.data.version).toBe(20);
    expect(preview.data.timeOverrides).toEqual({});
    expect(preview.summary.shiftTypeCount).toBe(7);
  });

  it('v4 백업 봉투의 일정·메모·설정과 생성 시각을 보존해 가져옵니다', () => {
    const preview = previewAppDataImport(
      JSON.stringify({
        format: LEGACY_APP_DATA_BACKUP_FORMAT,
        formatVersion: 1,
        exportedAt: '2026-07-10T12:00:00.000Z',
        data: createV4Data(),
      }),
    );

    expect(preview.source).toBe('backup');
    expect(preview.exportedAt).toBe('2026-07-10T12:00:00.000Z');
    expect(preview.migratedFromVersion).toBe(4);
    expect(preview.data.overrides).toEqual({ '2026-07-15': 'substitute-day' });
    expect(preview.data.notes).toEqual({ '2026-07-15': 'v4 메모' });
    expect(preview.data.settings.notificationsEnabled).toBe(true);
  });

  it('본문과 백업 JSON은 UTF-8 4MB 경계까지 읽고 1바이트 초과는 파싱 전에 거절합니다', () => {
    const data = createDefaultAppData('2026-07-11');
    const encoder = new TextEncoder();
    const snapshot = serializeAppData(data);
    const backup = exportAppDataToJson(
      data,
      new Date('2026-07-11T12:00:00.000Z'),
      { pretty: false },
    );
    const snapshotAtLimit = `${snapshot}${' '.repeat(
      MAX_APP_DATA_BYTES - encoder.encode(snapshot).length,
    )}`;
    const backupAtLimit = `${backup}${' '.repeat(
      MAX_APP_DATA_BYTES - encoder.encode(backup).length,
    )}`;

    expect(encoder.encode(snapshotAtLimit)).toHaveLength(MAX_APP_DATA_BYTES);
    expect(encoder.encode(backupAtLimit)).toHaveLength(MAX_APP_DATA_BYTES);
    expect(parseAppDataJson(snapshotAtLimit).data).toEqual(data);
    expect(previewAppDataImport(backupAtLimit).data).toEqual(data);

    const parseSpy = vi.spyOn(JSON, 'parse');
    try {
      expect(() => parseAppDataJson(`${snapshotAtLimit} `)).toThrow('4MB');
      expect(() => previewAppDataImport(`${backupAtLimit} `)).toThrow('4MB');
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('한글 다중바이트 입력도 문자 수가 아니라 UTF-8 바이트로 파싱 전에 제한합니다', () => {
    const snapshot = serializeAppData(createDefaultAppData('2026-07-11'));
    const encoder = new TextEncoder();
    const oversized = `${snapshot}${' '.repeat(
      MAX_APP_DATA_BYTES - encoder.encode(snapshot).length - 2,
    )}가`;

    expect(oversized.length).toBeLessThan(MAX_APP_DATA_BYTES);
    expect(encoder.encode(oversized)).toHaveLength(MAX_APP_DATA_BYTES + 1);

    const parseSpy = vi.spyOn(JSON, 'parse');
    try {
      expect(() => parseAppDataJson(oversized)).toThrow('4MB');
      expect(() => previewAppDataImport(oversized)).toThrow('4MB');
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('지원하지 않는 버전과 깨진 JSON을 거절합니다', () => {
    expect(() => parseAppDataJson('{')).toThrow('JSON 형식이 올바르지 않아요');
    expect(() =>
      validateAndMigrateAppData({ ...createDefaultAppData('2026-07-11'), version: 99 }),
    ).toThrow('지원하지 않는');
  });

  it('지원하지 않는 테마 값을 거절합니다', () => {
    const data = createDefaultAppData('2026-07-11');

    expect(() =>
      validateAndMigrateAppData({
        ...data,
        settings: { ...data.settings, themeMode: 'automatic' },
      }),
    ).toThrow('테마 값이 올바르지 않아요');
  });

  it('기존 자동 테마 값을 읽으면 다크 테마로 정규화해요', () => {
    const data = createDefaultAppData('2026-07-11');
    const parsed = validateAndMigrateAppData({
      ...data,
      settings: { ...data.settings, themeMode: 'system' },
    });

    expect(parsed.data.settings.themeMode).toBe('dark');
    expect(parsed.requiresPersistence).toBe(true);
  });

  it('v2 자료에는 첫 설정 완료 상태가 반드시 있어야 합니다', () => {
    const data = createV2Data();
    const { setupCompleted: _setupCompleted, ...settings } = data.settings;

    expect(() => validateAndMigrateAppData({ ...data, settings })).toThrow('첫 설정 완료 여부');
  });
});

describe('근무표 기기 저장', () => {
  it('읽기에 실패하면 기본값을 덮어쓰지 않고 오류로 남깁니다', async () => {
    const storage = new MemoryStorage();
    storage.readError = true;

    const result = await loadAppDataFromStorage(
      storage,
      createDefaultAppData('2026-07-11'),
      new Date('2026-07-11T12:00:00.000Z'),
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('io');
    expect(canRecoverAppDataFromSafetyBackup(result)).toBe(false);
    expect(storage.writes).toHaveLength(0);
  });

  it('저장 자료가 없으면 새 근무표와 빈 저장 상태로 구분합니다', async () => {
    const storage = new MemoryStorage();
    const fallback = createDefaultAppData('2026-07-11');

    const result = await loadAppDataFromStorage(storage, fallback);

    expect(result).toEqual({
      ok: true,
      data: fallback,
      source: 'empty',
      persistedSnapshot: null,
    });
    expect(storage.writes).toHaveLength(0);
  });

  it('본문만 사라지고 안전 백업이 남아 있으면 사용자 선택 전 복구를 요구합니다', async () => {
    const storage = new MemoryStorage();
    const backupData = createDefaultAppData('2026-07-09');
    storage.values.set(
      APP_DATA_LAST_KNOWN_GOOD_KEY,
      exportAppDataToJson(backupData, new Date('2026-07-11T09:00:00.000Z')),
    );

    const result = await loadAppDataFromStorage(
      storage,
      createDefaultAppData('2026-07-11'),
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('recovery-required');
    expect(!result.ok && result.reason === 'recovery-required' && result.recovery)
      .toMatchObject({
        data: backupData,
        exportedAt: '2026-07-11T09:00:00.000Z',
        source: 'last-known-good',
      });
    expect(storage.writes).toHaveLength(0);
  });

  it('본문 누락 시 내부와 기기 백업 중 실제 생성 시각이 가장 최근인 정상본을 제안합니다', async () => {
    const storage = new MemoryStorage();
    const automaticData = createDefaultAppData('2026-07-08');
    const deviceData = createDefaultAppData('2026-07-10');
    storage.values.set(
      APP_DATA_AUTOMATIC_BACKUP_KEY,
      exportAppDataToJson(automaticData, new Date('2026-07-11T08:00:00.000Z')),
    );

    const result = await loadAppDataFromStorage(
      storage,
      createDefaultAppData('2026-07-11'),
      new Date('2026-07-11T12:00:00.000Z'),
      undefined,
      {
        missingPrimaryRecoveryCandidates: [
          {
            raw: exportAppDataToJson(
              deviceData,
              new Date('2026-07-11T10:00:00.000Z'),
            ),
            source: 'device-safety',
          },
        ],
      },
    );

    expect(result.ok).toBe(false);
    expect(
      !result.ok && result.reason === 'recovery-required'
        ? result.recovery.source
        : null,
    ).toBe('device-safety');
    expect(
      !result.ok && result.reason === 'recovery-required'
        ? result.recovery.data
        : null,
    ).toEqual(deviceData);
  });

  it('명시적으로 초기화한 표식이 있으면 오래된 백업을 자동으로 되살리지 않습니다', async () => {
    const storage = new MemoryStorage();
    const writer = createSerializedStorageWriter(storage);
    const fallback = createDefaultAppData('2026-07-11');
    storage.values.set(
      APP_DATA_LAST_KNOWN_GOOD_KEY,
      exportAppDataToJson(createDefaultAppData('2026-07-01')),
    );
    await writeExplicitResetMarker(
      writer,
      new Date('2026-07-11T12:00:00.000Z'),
    );

    const resetResult = await loadAppDataFromStorage(storage, fallback);
    expect(resetResult).toEqual({
      ok: true,
      data: fallback,
      source: 'reset',
      persistedSnapshot: null,
    });

    await clearExplicitResetMarker(writer);
    const recoveryResult = await loadAppDataFromStorage(storage, fallback);
    expect(recoveryResult.ok).toBe(false);
    expect(!recoveryResult.ok && recoveryResult.reason).toBe('recovery-required');
    expect(storage.values.get(APP_DATA_EXPLICIT_RESET_MARKER_KEY)).toBe('');
  });

  it('손상된 저장 원문은 덮어쓰지 않고 별도 키에 보관합니다', async () => {
    const storage = new MemoryStorage();
    const corruptRaw = '{"version":5,"broken":';
    storage.values.set(APP_DATA_STORAGE_KEY, corruptRaw);

    const result = await loadAppDataFromStorage(
      storage,
      createDefaultAppData('2026-07-11'),
      new Date('2026-07-11T12:00:00.000Z'),
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('corrupt');
    expect(canRecoverAppDataFromSafetyBackup(result)).toBe(true);
    expect(storage.values.get(APP_DATA_STORAGE_KEY)).toBe(corruptRaw);
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0].key).toContain('alarmpyo:corrupt:');
    expect(storage.writes[0].value).toBe(corruptRaw);
  });

  it('손상 원본을 보존하지 못하면 안전 백업으로 덮어쓸 수 없다고 표시합니다', async () => {
    const corruptRaw = '{"version":14,"broken":';
    const storage: StorageAdapter = {
      getItem: async (key) => key === APP_DATA_STORAGE_KEY ? corruptRaw : null,
      setItem: async () => {
        throw new Error('쓰기 실패');
      },
    };

    const result = await loadAppDataFromStorage(
      storage,
      createDefaultAppData('2026-07-11'),
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('corrupt');
    expect(!result.ok && result.corruptBackupKey).toBeNull();
    expect(canRecoverAppDataFromSafetyBackup(result)).toBe(false);
  });

  it('AsyncStorage 기록이 실패해도 독립 파일에 격리하면 안전 복구를 계속해요', async () => {
    const corruptRaw = '{"version":17,"broken":';
    const storage: StorageAdapter = {
      getItem: async (key) => key === APP_DATA_STORAGE_KEY ? corruptRaw : null,
      setItem: async () => {
        throw new Error('저장 실패');
      },
    };
    const quarantine = async (raw: string) => {
      expect(raw).toBe(corruptRaw);
      return 'device-file:alarmpyo-recovery/corrupt-app-data-latest.json';
    };

    const result = await loadAppDataFromStorage(
      storage,
      createDefaultAppData('2026-07-11'),
      new Date('2026-07-11T12:00:00.000Z'),
      quarantine,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.corruptBackupKey).toContain('device-file:');
    expect(canRecoverAppDataFromSafetyBackup(result)).toBe(true);
  });

  it('저장 상한을 넘는 본문은 AsyncStorage에 쓰기 전에 거부해요', async () => {
    const storage = new MemoryStorage();
    const writer = createSerializedStorageWriter(storage);
    const coordinator = createLatestStorageValueCoordinator(
      writer,
      APP_DATA_STORAGE_KEY,
    );

    const result = await persistSnapshotWithLastKnownGood(
      coordinator,
      writer,
      'a'.repeat(MAX_APP_DATA_BYTES + 1),
      null,
    );

    expect(result.primarySaved).toBe(false);
    expect(storage.writes).toHaveLength(0);
  });

  it('저장소의 4MB 초과 본문은 JSON 파싱 없이 손상 자료로 격리합니다', async () => {
    const storage = new MemoryStorage();
    const snapshot = serializeAppData(createDefaultAppData('2026-07-11'));
    const oversized = `${snapshot}${' '.repeat(
      MAX_APP_DATA_BYTES - new TextEncoder().encode(snapshot).length + 1,
    )}`;
    storage.values.set(APP_DATA_STORAGE_KEY, oversized);

    const parseSpy = vi.spyOn(JSON, 'parse');
    try {
      const result = await loadAppDataFromStorage(
        storage,
        createDefaultAppData('2026-07-11'),
      );

      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toBe('corrupt');
      expect(storage.values.get(APP_DATA_CORRUPT_BACKUP_KEY)).toBe(oversized);
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('손상 원본을 고정된 복구 키에 덮어써 무제한 누적을 막습니다', async () => {
    const storage = new MemoryStorage();
    storage.values.set(APP_DATA_STORAGE_KEY, '{"첫째":');
    await loadAppDataFromStorage(storage, createDefaultAppData('2026-07-11'));

    storage.values.set(APP_DATA_STORAGE_KEY, '{"둘째":');
    await loadAppDataFromStorage(storage, createDefaultAppData('2026-07-11'));

    expect(storage.writes.map(({ key }) => key)).toEqual([
      APP_DATA_CORRUPT_BACKUP_KEY,
      APP_DATA_CORRUPT_BACKUP_KEY,
    ]);
    expect(storage.values.get(APP_DATA_CORRUPT_BACKUP_KEY)).toBe('{"둘째":');
  });

  it('v1 자료를 읽으면 마이그레이션 저장이 필요하다고 알립니다', async () => {
    const storage = new MemoryStorage();
    storage.values.set(APP_DATA_STORAGE_KEY, JSON.stringify(createV1Data()));

    const result = await loadAppDataFromStorage(storage, createDefaultAppData('2026-07-11'));

    expect(result.ok && result.source).toBe('migrated');
    expect(result.ok && result.persistedSnapshot).toBeNull();
    expect(result.ok && result.data.version).toBe(20);
    expect(result.ok && result.data.timeOverrides).toEqual({});
    expect(result.ok && result.data.settings.setupCompleted).toBe(false);
  });

  it('v2 자료도 마이그레이션 저장이 필요하다고 알립니다', async () => {
    const storage = new MemoryStorage();
    storage.values.set(APP_DATA_STORAGE_KEY, JSON.stringify(createV2Data()));

    const result = await loadAppDataFromStorage(storage, createDefaultAppData('2026-07-11'));

    expect(result.ok && result.source).toBe('migrated');
    expect(result.ok && result.persistedSnapshot).toBeNull();
    expect(result.ok && result.data.version).toBe(20);
    expect(result.ok && result.data.timeOverrides).toEqual({});
    expect(result.ok && result.data.settings.setupCompleted).toBe(true);
    expect(
      result.ok && result.data.shiftTypes.some((item) => item.id === 'substitute-day'),
    ).toBe(true);
    expect(
      result.ok && result.data.shiftTypes.some((item) => item.id === 'substitute-night'),
    ).toBe(true);
  });

  it('v3 자료는 알람 기본값을 한 번 이전하고 다시 저장할 대상으로 표시합니다', async () => {
    const storage = new MemoryStorage();
    storage.values.set(APP_DATA_STORAGE_KEY, JSON.stringify(createV3Data()));

    const result = await loadAppDataFromStorage(storage, createDefaultAppData('2026-07-11'));

    expect(result.ok && result.source).toBe('migrated');
    expect(result.ok && result.persistedSnapshot).toBeNull();
    expect(result.ok && result.data.version).toBe(20);
    expect(result.ok && result.data.timeOverrides).toEqual({});
    expect(result.ok && shift(result.data, 'day').alarmMinutesBefore).toBe(
      DEFAULT_ALARM_MINUTES_BEFORE,
    );
    expect(result.ok && shift(result.data, 'night').alarmMinutesBefore).toBe(
      DEFAULT_ALARM_MINUTES_BEFORE,
    );
  });

  it('v4 자료도 대체근무를 분리하고 다시 저장할 대상으로 표시합니다', async () => {
    const storage = new MemoryStorage();
    storage.values.set(APP_DATA_STORAGE_KEY, JSON.stringify(createV4Data()));

    const result = await loadAppDataFromStorage(storage, createDefaultAppData('2026-07-11'));

    expect(result.ok && result.source).toBe('migrated');
    expect(result.ok && result.persistedSnapshot).toBeNull();
    expect(result.ok && result.data.version).toBe(20);
    expect(result.ok && result.data.timeOverrides).toEqual({});
    expect(result.ok && result.data.overrides['2026-07-15']).toBe('substitute-day');
    expect(result.ok && result.data.notes['2026-07-15']).toBe('v4 메모');
  });

  it('여러 쓰기를 호출 순서대로 한 번씩 처리합니다', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstWait = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const storage: StorageAdapter = {
      getItem: async () => null,
      setItem: async (_key, value) => {
        order.push(`시작:${value}`);
        if (value === '첫째') await firstWait;
        order.push(`완료:${value}`);
      },
    };
    const writer = createSerializedStorageWriter(storage);

    const first = writer.write('key', '첫째');
    const second = writer.write('key', '둘째');
    await Promise.resolve();
    expect(order).toEqual(['시작:첫째']);
    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['시작:첫째', '완료:첫째', '시작:둘째', '완료:둘째']);
  });

  it('앞선 쓰기가 실패해도 다음 쓰기를 이어서 처리합니다', async () => {
    const saved: string[] = [];
    let attempts = 0;
    const storage: StorageAdapter = {
      getItem: async () => null,
      setItem: async (_key, value) => {
        attempts += 1;
        if (attempts === 1) throw new Error('첫 쓰기 실패');
        saved.push(value);
      },
    };
    const writer = createSerializedStorageWriter(storage);

    const failed = writer.write('key', '실패').catch(() => false);
    const succeeded = writer.write('key', '재시도');
    await Promise.all([failed, succeeded]);

    expect(attempts).toBe(2);
    expect(saved).toEqual(['재시도']);
  });

  it('A → B → A가 겹쳐도 마지막 A를 기기에 남깁니다', async () => {
    const saved: string[] = [];
    let releaseB!: () => void;
    const waitForB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    const storage: StorageAdapter = {
      getItem: async () => null,
      setItem: async (_key, value) => {
        saved.push(value);
        if (value === 'B') await waitForB;
      },
    };
    const writer = createSerializedStorageWriter(storage);
    const coordinator = createLatestStorageValueCoordinator(writer, APP_DATA_STORAGE_KEY);
    coordinator.setPersistedValue('A');

    const writeB = coordinator.writeLatest('B');
    await Promise.resolve();
    expect(saved).toEqual(['B']);
    const writeA = coordinator.writeLatest('A');
    releaseB();
    const [resultB, resultA] = await Promise.all([writeB, writeA]);

    expect(saved).toEqual(['B', 'A']);
    expect(resultB.persistedValue).toBe('A');
    expect(resultA.persistedValue).toBe('A');
    expect(coordinator.getPersistedValue()).toBe('A');
  });

  it('이미 저장된 값은 건너뛰고 강제 저장만 실제 쓰기로 표시합니다', async () => {
    const storage = new MemoryStorage();
    const writer = createSerializedStorageWriter(storage);
    const coordinator = createLatestStorageValueCoordinator(writer, APP_DATA_STORAGE_KEY);
    coordinator.setPersistedValue('같은 값');

    await expect(coordinator.writeLatest('같은 값')).resolves.toMatchObject({ wrote: false });
    expect(storage.writes).toHaveLength(0);

    await expect(
      coordinator.writeLatest('같은 값', { force: true }),
    ).resolves.toMatchObject({ wrote: true });
    expect(storage.writes).toHaveLength(1);
  });

  it('초기화 전 자동 백업을 저장하고 다시 읽습니다', async () => {
    const storage = new MemoryStorage();
    const writer = createSerializedStorageWriter(storage);
    const data = createDefaultAppData('2026-07-11');

    const backup = await writeAutomaticBackup(
      writer,
      data,
      new Date('2026-07-11T12:00:00.000Z'),
    );

    expect(storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY)).toBe(backup);
    expect(await readAutomaticBackup(storage)).toBe(backup);
    expect(previewAppDataImport(backup).data).toEqual(data);
    expect(serializeAppData(data)).toBe(JSON.stringify(data));
  });

  it('최근 정상 저장본을 별도 백업으로 갱신합니다', async () => {
    const storage = new MemoryStorage();
    const writer = createSerializedStorageWriter(storage);
    const data = createDefaultAppData('2026-07-11');
    const snapshot = serializeAppData(data);

    const backup = await writeLastKnownGoodBackup(
      writer,
      snapshot,
      new Date('2026-07-11T12:00:00.000Z'),
    );

    expect(storage.values.get(APP_DATA_LAST_KNOWN_GOOD_KEY)).toBe(backup);
    expect(await readLastKnownGoodBackup(storage)).toBe(backup);
    expect(previewAppDataImport(backup).data).toEqual(data);
  });

  it('최근 정상 저장본이 손상됐으면 정상적인 초기화 전 백업으로 복구합니다', async () => {
    const storage = new MemoryStorage();
    const data = createDefaultAppData('2026-07-11');
    const automaticBackup = exportAppDataToJson(
      data,
      new Date('2026-07-11T12:00:00.000Z'),
    );
    storage.values.set(APP_DATA_LAST_KNOWN_GOOD_KEY, '{"손상":');
    storage.values.set(APP_DATA_AUTOMATIC_BACKUP_KEY, automaticBackup);

    await expect(readRecoveryBackup(storage)).resolves.toBe(automaticBackup);
  });
});
