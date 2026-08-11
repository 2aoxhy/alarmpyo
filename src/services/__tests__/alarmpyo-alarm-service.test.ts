import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireOptionalNativeModule = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({ requireOptionalNativeModule }));

type AlarmFixture = {
  id: string;
  dateKey: string;
  shiftTypeId: string;
  shiftName: string;
  alarmAt: number;
  startMinutes: number;
  alarmMinutesBefore: number;
};

type StatusFixture = {
  supported: boolean;
  enabled: boolean;
  triggerState?: string;
  storageHealth?: string;
  exactAlarmAllowed: boolean;
  fullScreenAllowed: boolean;
  notificationsAllowed: boolean;
  alarmVolume: number;
  alarmSafety?: {
    nextCheckAt: number;
    lastCheckedAt: number;
    issueCodes: unknown[];
    lastNotifiedAt: number;
  };
  scheduledAlarms: AlarmFixture[];
  scheduledCount: number;
  lastRestoreResult?: {
    expectedCount: number;
    scheduledCount: number;
    completed: boolean;
  };
  widgetInstalled?: boolean;
  widgetSnapshotGeneratedAt?: number;
  recentEvents?: unknown[];
};

const STATUS: StatusFixture = {
  supported: true,
  enabled: true,
  triggerState: 'scheduled',
  storageHealth: 'normal',
  exactAlarmAllowed: true,
  fullScreenAllowed: true,
  notificationsAllowed: true,
  alarmVolume: 5,
  scheduledAlarms: [],
  scheduledCount: 0,
  widgetInstalled: false,
  widgetSnapshotGeneratedAt: 0,
  recentEvents: [],
};

function nativeModule() {
  return {
    syncAlarmsAsync: vi.fn(async () => STATUS),
    getStatusAsync: vi.fn(async () => STATUS),
    scheduleTestAlarmAsync: vi.fn(async () => STATUS),
    requestAlarmPermissionsAsync: vi.fn(async () => STATUS),
    openAlarmPermissionSettingsAsync: vi.fn(async () => STATUS),
    openFullScreenPermissionSettingsAsync: vi.fn(async () => STATUS),
    openDoNotDisturbSettingsAsync: vi.fn(async () => true),
    openBatterySettingsAsync: vi.fn(async () => true),
    cancelAllAsync: vi.fn(async () => STATUS),
    isWidgetInstalledAsync: vi.fn(async () => false),
    requestWidgetPinAsync: vi.fn(async () => ({
      status: 'requested',
      supported: true,
      installed: false,
    })),
  };
}

// 전체 테스트를 병렬 실행하면 이 파일의 첫 동적 import가 서비스 모듈 변환을
// 기다리느라 개별 테스트의 5초 제한을 소진할 수 있어요. 첫 인스턴스는 파일을
// 불러오는 단계에서 준비하고, 이후 테스트만 resetModules로 격리해요.
const coldStartNative = nativeModule();
requireOptionalNativeModule.mockReturnValue(coldStartNative);
const coldStartService = await import('../alarmpyo-alarm-service');

async function loadService(
  module: Record<string, unknown> | null,
) {
  requireOptionalNativeModule.mockReturnValue(module);
  return import('../alarmpyo-alarm-service');
}

beforeEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  requireOptionalNativeModule.mockReset();
});

describe('ALARMPYO 알람 서비스', () => {
  it('전체 취소는 빈 계획 동기화가 아니라 네이티브 cancelAll을 호출해요', async () => {
    const native = coldStartNative;
    native.cancelAllAsync.mockResolvedValueOnce({
      ...STATUS,
      enabled: false,
      scheduledAlarms: [],
      scheduledCount: 0,
    });
    const service = coldStartService;

    await expect(service.cancelAllAlarmPyoAlarms()).resolves.toMatchObject({
      enabled: false,
      scheduledAlarms: [],
      scheduledCount: 0,
    });

    expect(native.cancelAllAsync).toHaveBeenCalledOnce();
    expect(native.syncAlarmsAsync).not.toHaveBeenCalled();
  });

  it('네이티브 모듈이 없는 실행 환경에서는 서로 독립된 안전 상태를 반환해요', async () => {
    const service = await loadService(null);
    const first = await service.getAlarmPyoAlarmStatus();
    first.scheduledAlarms.push({
      id: '외부 변경',
      dateKey: '2026-07-11',
      shiftTypeId: 'day',
      shiftName: '주간',
      alarmAt: Date.now(),
      startMinutes: 7 * 60,
      alarmMinutesBefore: 2 * 60,
    });

    await expect(service.getAlarmPyoAlarmStatus()).resolves.toEqual({
      supported: false,
      enabled: false,
      triggerState: 'not-scheduled',
      storageHealth: 'normal',
      exactAlarmAllowed: false,
      fullScreenAllowed: false,
      notificationsAllowed: false,
      doNotDisturbActive: false,
      doNotDisturbMaySilenceAlarm: false,
      batteryOptimizationIgnored: true,
      alarmVolume: 0,
      alarmSafety: undefined,
      plannedThroughAt: 0,
      planRefreshRecommendedAt: 0,
      planRefreshReminderPending: false,
      scheduledAlarms: [],
      scheduledCount: 0,
      lastRestoreResult: null,
      widgetInstalled: false,
      widgetSnapshotGeneratedAt: 0,
      recentEvents: [],
    });
    await expect(service.syncAlarmPyoAlarms([])).resolves.toMatchObject({
      supported: false,
      scheduledCount: 0,
    });
  });

  it('시험 알람 대기 시간이 잘못되면 네이티브 호출 전에 막아요', async () => {
    const service = await loadService(null);

    await expect(service.scheduleAlarmPyoTestAlarm(4)).rejects.toThrow('5초 이상 60초 이하');
    await expect(service.scheduleAlarmPyoTestAlarm(61)).rejects.toThrow('5초 이상 60초 이하');
    await expect(service.scheduleAlarmPyoTestAlarm(5.5)).rejects.toThrow('5초 이상 60초 이하');
  });

  it('위젯 설치 여부는 알람 상태를 읽지 않고 전용 네이티브 함수로 확인해요', async () => {
    const native = nativeModule();
    native.isWidgetInstalledAsync.mockResolvedValueOnce(true);
    const service = await loadService(native);

    await expect(service.isAlarmPyoWidgetInstalled()).resolves.toBe(true);
    expect(native.isWidgetInstalledAsync).toHaveBeenCalledOnce();
    expect(native.getStatusAsync).not.toHaveBeenCalled();
  });

  it('전용 함수가 없으면 상태 응답으로 위젯 설치 여부를 확인해요', async () => {
    const native = nativeModule();
    native.getStatusAsync.mockResolvedValueOnce({ ...STATUS, widgetInstalled: true });
    const { isWidgetInstalledAsync: _isWidgetInstalledAsync, ...legacyNative } = native;
    const service = await loadService(legacyNative);

    await expect(service.isAlarmPyoWidgetInstalled()).resolves.toBe(true);
    expect(native.getStatusAsync).toHaveBeenCalledOnce();
  });

  it('홈 화면 위젯 추가 요청 결과를 안전하게 전달해요', async () => {
    const native = nativeModule();
    const service = await loadService(native);

    await expect(service.requestAlarmPyoWidgetPin()).resolves.toEqual({
      status: 'requested',
      supported: true,
      installed: false,
    });
    expect(native.requestWidgetPinAsync).toHaveBeenCalledOnce();
  });

  it('위젯 추가 기능이 없는 네이티브 구현에서는 수동 추가 안내 상태를 반환해요', async () => {
    const native = nativeModule();
    const { requestWidgetPinAsync: _requestWidgetPinAsync, ...legacyNative } = native;
    const service = await loadService(legacyNative);

    await expect(service.requestAlarmPyoWidgetPin()).resolves.toEqual({
      status: 'unsupported',
      supported: false,
      installed: false,
    });
  });

  it('권한 설정 버튼은 상태를 중복 조회하지 않고 네이티브 통합 설정을 한 번 열어요', async () => {
    const native = nativeModule();
    const service = await loadService(native);

    await expect(service.openAlarmPyoAlarmPermissionSettings()).resolves.toBe(true);
    expect(native.openAlarmPermissionSettingsAsync).toHaveBeenCalledTimes(1);
    expect(native.getStatusAsync).not.toHaveBeenCalled();
    expect(native.openFullScreenPermissionSettingsAsync).not.toHaveBeenCalled();
    expect(native.requestAlarmPermissionsAsync).not.toHaveBeenCalled();
  });

  it('빠르게 바뀐 계획은 마지막 값만 네이티브에 전달해요', async () => {
    const native = nativeModule();
    const service = await loadService(native);
    const base = {
      dateKey: '2026-07-11',
      shiftTypeId: 'day',
      shiftName: '주간',
      alarmAt: new Date(2026, 6, 11, 5, 0).getTime(),
      startMinutes: 7 * 60,
      alarmMinutesBefore: 2 * 60,
    };

    const first = service.syncAlarmPyoAlarms([{ ...base, id: '첫 계획' }]);
    const second = service.syncAlarmPyoAlarms([{ ...base, id: '마지막 계획' }]);
    await Promise.all([first, second]);

    expect(native.syncAlarmsAsync).toHaveBeenCalledTimes(1);
    expect(native.syncAlarmsAsync).toHaveBeenCalledWith([
      expect.objectContaining({ id: '마지막 계획' }),
    ]);
  });

  it('새 네이티브 모듈에는 366일 안전 계획 메타데이터를 함께 전달해요', async () => {
    const native = {
      ...nativeModule(),
      syncAlarmsWithMetadataAsync: vi.fn(async () => STATUS),
    };
    const service = await loadService(native);
    const alarm = {
      id: '안전 계획',
      dateKey: '2026-07-11',
      shiftTypeId: 'day',
      shiftName: '주간',
      alarmAt: new Date(2026, 6, 11, 5, 0).getTime(),
      startMinutes: 7 * 60,
      alarmMinutesBefore: 2 * 60,
    };
    const metadata = {
      generatedAt: new Date(2026, 6, 11, 0, 0).getTime(),
      refreshRecommendedAt: new Date(2026, 9, 9, 0, 0).getTime(),
      safetyThroughAt: new Date(2027, 6, 12, 0, 0).getTime(),
    };

    await service.syncAlarmPyoAlarms([alarm], metadata);

    expect(native.syncAlarmsWithMetadataAsync).toHaveBeenCalledWith([alarm], metadata);
    expect(native.syncAlarmsAsync).not.toHaveBeenCalled();
  });

  it('안전 계획 메타데이터 순서가 올바르지 않으면 네이티브 호출 전에 막아요', async () => {
    const native = nativeModule();
    const service = await loadService(native);

    await expect(service.syncAlarmPyoAlarms([], {
      generatedAt: 300,
      refreshRecommendedAt: 200,
      safetyThroughAt: 100,
    })).rejects.toThrow('안전 계획 메타데이터');
    expect(native.syncAlarmsAsync).not.toHaveBeenCalled();
  });

  it('동시에 요청한 상태 조회를 한 번만 실행하고 반환값을 서로 독립적으로 복제해요', async () => {
    const native = nativeModule();
    let resolveStatus!: (value: StatusFixture) => void;
    native.getStatusAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    const service = await loadService(native);
    const alarm = {
      id: '상태 조회 알람',
      dateKey: '2026-07-11',
      shiftTypeId: 'day',
      shiftName: '주간',
      alarmAt: new Date(2026, 6, 11, 5, 0).getTime(),
      startMinutes: 7 * 60,
      alarmMinutesBefore: 2 * 60,
    };

    const firstPromise = service.getAlarmPyoAlarmStatus();
    const secondPromise = service.getAlarmPyoAlarmStatus();
    expect(native.getStatusAsync).toHaveBeenCalledOnce();

    resolveStatus({ ...STATUS, scheduledAlarms: [alarm], scheduledCount: 1 });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    first.scheduledAlarms[0].shiftName = '외부 변경';
    first.scheduledAlarms.push({ ...alarm, id: '추가 변경' });

    expect(second.scheduledAlarms).toEqual([alarm]);
    await expect(service.getAlarmPyoAlarmStatus()).resolves.toMatchObject({
      scheduledAlarms: [alarm],
      scheduledCount: 1,
    });
    expect(native.getStatusAsync).toHaveBeenCalledOnce();
  });

  it('네이티브 안전 점검 상태와 이슈 코드를 캐시에서도 독립적으로 보존해요', async () => {
    const native = nativeModule();
    native.getStatusAsync.mockResolvedValueOnce({
      ...STATUS,
      alarmSafety: {
        nextCheckAt: 1_786_400_000_000,
        lastCheckedAt: 1_786_300_000_000,
        issueCodes: ['notifications', 'schedule', 'notifications', '', 7],
        lastNotifiedAt: 0,
      },
    });
    const service = await loadService(native);

    const first = await service.getAlarmPyoAlarmStatus();
    expect(first.alarmSafety).toEqual({
      nextCheckAt: 1_786_400_000_000,
      lastCheckedAt: 1_786_300_000_000,
      issueCodes: ['notifications', 'schedule'],
      lastNotifiedAt: 0,
    });
    first.alarmSafety?.issueCodes.push('외부 변경');

    await expect(service.getAlarmPyoAlarmStatus()).resolves.toMatchObject({
      alarmSafety: {
        issueCodes: ['notifications', 'schedule'],
      },
    });
  });

  it('손상된 선택 안전 점검 상태는 안전하게 생략해요', async () => {
    const native = nativeModule();
    native.getStatusAsync.mockResolvedValueOnce({
      ...STATUS,
      alarmSafety: {
        nextCheckAt: -1,
        lastCheckedAt: 0,
        issueCodes: ['schedule'],
        lastNotifiedAt: 0,
      },
    });
    const service = await loadService(native);

    await expect(service.getAlarmPyoAlarmStatus()).resolves.toMatchObject({
      alarmSafety: undefined,
    });
  });

  it('짧은 캐시 동안 중복 조회를 막고 0.75초 뒤에는 상태를 새로 확인해요', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 11, 12, 0));
    const native = nativeModule();
    const service = await loadService(native);

    await service.getAlarmPyoAlarmStatus();
    await service.getAlarmPyoAlarmStatus();
    expect(native.getStatusAsync).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(749);
    await service.getAlarmPyoAlarmStatus();
    expect(native.getStatusAsync).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await service.getAlarmPyoAlarmStatus();
    expect(native.getStatusAsync).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date(2026, 6, 11, 11, 0));
    await service.getAlarmPyoAlarmStatus();
    expect(native.getStatusAsync).toHaveBeenCalledTimes(3);
  });

  it('동기화 작업 뒤에는 이전 조회 캐시 대신 작업의 최신 상태를 사용해요', async () => {
    const native = nativeModule();
    native.getStatusAsync.mockResolvedValueOnce({
      ...STATUS,
      enabled: false,
      scheduledCount: 0,
    });
    const syncedAlarm = {
      id: '동기화 알람',
      dateKey: '2026-07-12',
      shiftTypeId: 'night',
      shiftName: '야간',
      alarmAt: new Date(2026, 6, 12, 16, 0).getTime(),
      startMinutes: 18 * 60,
      alarmMinutesBefore: 2 * 60,
    };
    native.syncAlarmsAsync.mockResolvedValueOnce({
      ...STATUS,
      scheduledAlarms: [syncedAlarm],
      scheduledCount: 1,
    });
    const service = await loadService(native);

    await service.getAlarmPyoAlarmStatus();
    await service.syncAlarmPyoAlarms([syncedAlarm]);
    await expect(service.getAlarmPyoAlarmStatus()).resolves.toMatchObject({
      scheduledAlarms: [syncedAlarm],
      scheduledCount: 1,
    });
    expect(native.getStatusAsync).toHaveBeenCalledOnce();
  });

  it('최근 알람 기록을 최신순으로 제한하고 손상된 항목은 안전하게 제외해요', async () => {
    const native = nativeModule();
    const validEvent = {
      id: 'event-valid',
      type: 'playback_confirmed',
      occurredAt: new Date(2026, 6, 14, 16, 0).getTime(),
      planId: 'night-alarm',
      shiftName: '야간',
      alarmAt: new Date(2026, 6, 14, 16, 0).getTime(),
      isTest: false,
      deliveryAttempt: 0,
      nextAlarmAt: 0,
    };
    native.getStatusAsync.mockResolvedValueOnce({
      ...STATUS,
      recentEvents: [
        { ...validEvent, id: 'older', occurredAt: validEvent.occurredAt - 1 },
        { ...validEvent, id: 'broken', type: 'unknown' },
        validEvent,
        validEvent,
        ...Array.from({ length: 14 }, (_, index) => ({
          ...validEvent,
          id: `extra-${index}`,
          occurredAt: validEvent.occurredAt - index - 2,
        })),
      ],
    });
    const service = await loadService(native);

    const status = await service.getAlarmPyoAlarmStatus();
    expect(status.recentEvents).toHaveLength(12);
    expect(status.recentEvents[0]).toEqual(validEvent);
    expect(status.recentEvents.some((event) => event.id === 'broken')).toBe(false);

    status.recentEvents[0].shiftName = '외부 변경';
    const cachedStatus = await service.getAlarmPyoAlarmStatus();
    expect(cachedStatus.recentEvents[0].shiftName).toBe('야간');
  });

  it('선택 응답 필드가 없는 네이티브 상태도 안전하게 읽어요', async () => {
    const native = nativeModule();
    const {
      recentEvents: _recentEvents,
      triggerState: _triggerState,
      storageHealth: _storageHealth,
      widgetInstalled: _widgetInstalled,
      widgetSnapshotGeneratedAt: _widgetSnapshotGeneratedAt,
      ...legacyStatus
    } = STATUS;
    native.getStatusAsync.mockResolvedValueOnce(legacyStatus);
    const service = await loadService(native);

    await expect(service.getAlarmPyoAlarmStatus()).resolves.toMatchObject({
      recentEvents: [],
      triggerState: 'not-scheduled',
      storageHealth: 'normal',
      lastRestoreResult: null,
      widgetInstalled: false,
      widgetSnapshotGeneratedAt: 0,
    });
  });

  it('알림 권한이 꺼져도 남아 있는 미래 예약을 전달 차단 상태로 구분해요', async () => {
    const native = nativeModule();
    native.getStatusAsync.mockResolvedValueOnce({
      ...STATUS,
      enabled: false,
      notificationsAllowed: false,
      triggerState: 'delivery-blocked',
      scheduledAlarms: [{
        id: 'future-day',
        dateKey: '2026-07-15',
        shiftTypeId: 'day',
        shiftName: '주간',
        alarmAt: new Date(2026, 6, 15, 5, 0).getTime(),
        startMinutes: 7 * 60,
        alarmMinutesBefore: 2 * 60,
      }],
      scheduledCount: 1,
    });
    const service = await loadService(native);

    await expect(service.getAlarmPyoAlarmStatus()).resolves.toMatchObject({
      triggerState: 'delivery-blocked',
      storageHealth: 'normal',
      notificationsAllowed: false,
      scheduledCount: 1,
    });
  });

  it('손상 저장소 상태와 기본 네이티브 상태를 안전하게 정규화해요', async () => {
    const native = nativeModule();
    native.getStatusAsync.mockResolvedValueOnce({
      ...STATUS,
      storageHealth: 'corrupt',
      triggerState: 'unknown',
      exactAlarmAllowed: false,
    });
    const service = await loadService(native);

    await expect(service.getAlarmPyoAlarmStatus()).resolves.toMatchObject({
      storageHealth: 'corrupt',
      triggerState: 'exact-alarm-required',
    });
  });

  it('부분 복원 결과를 보존하고 잘못된 완료 표시는 차단해요', async () => {
    const native = nativeModule();
    native.getStatusAsync.mockResolvedValueOnce({
      ...STATUS,
      lastRestoreResult: {
        expectedCount: 3,
        scheduledCount: 2,
        completed: true,
      },
    });
    const service = await loadService(native);

    await expect(service.getAlarmPyoAlarmStatus()).resolves.toMatchObject({
      lastRestoreResult: {
        expectedCount: 3,
        scheduledCount: 2,
        completed: false,
      },
    });
  });
});
