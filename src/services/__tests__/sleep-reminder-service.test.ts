import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAlarmPyoNativeModule = vi.hoisted(() => vi.fn());

vi.mock('../../infrastructure/alarmpyo-native-module', () => ({
  getAlarmPyoNativeModule,
}));

async function loadService(module: Record<string, unknown> | null) {
  getAlarmPyoNativeModule.mockReturnValue(module);
  return import('../sleep-reminder-service');
}

beforeEach(() => {
  vi.resetModules();
  getAlarmPyoNativeModule.mockReset();
});

describe('수면 시작 알림 네이티브 서비스', () => {
  it('웹과 이전 APK에서는 안전한 미지원 상태를 반환해요', async () => {
    const service = await loadService(null);

    await expect(service.getAlarmPyoSleepReminderStatus()).resolves.toEqual({
      supported: false,
      enabled: false,
      notificationsAllowed: false,
      scheduledCount: 0,
    });
    await expect(service.syncAlarmPyoSleepReminders([])).resolves.toEqual({
      supported: false,
      enabled: false,
      notificationsAllowed: false,
      scheduledCount: 0,
    });
    await expect(service.cancelAlarmPyoSleepReminders()).resolves.toEqual({
      supported: false,
      enabled: false,
      notificationsAllowed: false,
      scheduledCount: 0,
    });
    await expect(service.requestAlarmPyoSleepReminderPermission()).resolves.toEqual({
      supported: false,
      enabled: false,
      notificationsAllowed: false,
      scheduledCount: 0,
    });
    await expect(service.openAlarmPyoSleepReminderSettings()).resolves.toEqual({
      supported: false,
      enabled: false,
      notificationsAllowed: false,
      scheduledCount: 0,
    });
    expect(service.isSleepReminderNativeSupported()).toBe(false);
  });

  it('계획 복사본을 동기화하고 네이티브 상태를 정규화해요', async () => {
    const syncSleepRemindersAsync = vi.fn(async (_plans: unknown[]) => ({
      supported: true,
      enabled: true,
      notificationsAllowed: false,
      scheduledCount: 2,
    }));
    const native = {
      syncSleepRemindersAsync,
      cancelSleepRemindersAsync: vi.fn(async () => ({})),
      getSleepReminderStatusAsync: vi.fn(async () => ({})),
      requestSleepReminderPermissionAsync: vi.fn(async () => ({})),
      openSleepReminderSettingsAsync: vi.fn(async () => ({})),
    };
    const service = await loadService(native);
    const plans = [
      {
        id: 'sleep-reminder:day',
        reminderAt: 1_800_000_000_000,
        shiftDate: '2027-01-15',
        shiftName: '주간',
        title: '수면 시작 시간이에요',
        body: '주간 전환 수면 목표 시각이에요. 지금 주무세요.',
      },
    ];

    await expect(service.syncAlarmPyoSleepReminders(plans)).resolves.toEqual({
      supported: true,
      enabled: true,
      notificationsAllowed: false,
      scheduledCount: 2,
    });
    expect(syncSleepRemindersAsync).toHaveBeenCalledWith(plans);
    expect(syncSleepRemindersAsync.mock.calls[0][0]).not.toBe(plans);
    expect(service.isSleepReminderNativeSupported()).toBe(true);
  });

  it('취소와 상태 조회의 잘못된 필드는 안전한 기본값으로 보정해요', async () => {
    const cancelSleepRemindersAsync = vi.fn(async () => ({
      supported: true,
      enabled: false,
      notificationsAllowed: true,
      scheduledCount: 0,
    }));
    const getSleepReminderStatusAsync = vi.fn(async () => ({
      supported: true,
      enabled: true,
      notificationsAllowed: true,
      scheduledCount: -1,
    }));
    const requestSleepReminderPermissionAsync = vi.fn(async () => ({
      supported: true,
      enabled: true,
      notificationsAllowed: false,
      scheduledCount: 0,
    }));
    const openSleepReminderSettingsAsync = vi.fn(async () => ({
      supported: true,
      enabled: true,
      notificationsAllowed: false,
      scheduledCount: 0,
    }));
    const service = await loadService({
      syncSleepRemindersAsync: vi.fn(async () => ({})),
      cancelSleepRemindersAsync,
      getSleepReminderStatusAsync,
      requestSleepReminderPermissionAsync,
      openSleepReminderSettingsAsync,
    });

    await expect(service.cancelAlarmPyoSleepReminders()).resolves.toEqual({
      supported: true,
      enabled: false,
      notificationsAllowed: true,
      scheduledCount: 0,
    });
    await expect(service.getAlarmPyoSleepReminderStatus()).resolves.toEqual({
      supported: true,
      enabled: true,
      notificationsAllowed: true,
      scheduledCount: 0,
    });
    await expect(service.requestAlarmPyoSleepReminderPermission()).resolves.toEqual({
      supported: true,
      enabled: true,
      notificationsAllowed: false,
      scheduledCount: 0,
    });
    await expect(service.openAlarmPyoSleepReminderSettings()).resolves.toEqual({
      supported: true,
      enabled: true,
      notificationsAllowed: false,
      scheduledCount: 0,
    });
  });
});
