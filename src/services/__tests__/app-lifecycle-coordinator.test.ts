import { describe, expect, it, vi } from 'vitest';

import type { AlarmPyoAlarmStatus } from '../alarmpyo-alarm-service';
import type { SleepReminderStatus } from '../sleep-reminder-service';
import { createAppLifecycleCoordinator } from '../app-lifecycle-coordinator';

const alarmStatus = { supported: true } as AlarmPyoAlarmStatus;
const sleepStatus = { supported: true } as SleepReminderStatus;

describe('AppLifecycleCoordinator', () => {
  it('같은 포그라운드 전환의 알람·수면 상태를 각각 한 번만 읽습니다', async () => {
    const readAlarmStatus = vi.fn(async () => alarmStatus);
    const readSleepReminderStatus = vi.fn(async () => sleepStatus);
    const coordinator = createAppLifecycleCoordinator({
      readAlarmStatus,
      readSleepReminderStatus,
    });

    await Promise.all([
      coordinator.refresh({ transitionId: 3, includeSleepReminder: true }),
      coordinator.refresh({ transitionId: 3, includeSleepReminder: true }),
    ]);
    await coordinator.refresh({ transitionId: 3, includeSleepReminder: true });

    expect(readAlarmStatus).toHaveBeenCalledOnce();
    expect(readSleepReminderStatus).toHaveBeenCalledOnce();
    expect(coordinator.getSnapshot()).toMatchObject({
      alarmStatus,
      alarmStatusError: false,
      sleepReminderStatus: sleepStatus,
      sleepReminderStatusError: false,
    });
  });

  it('새 포그라운드 전환과 명시적 무효화는 상태를 다시 읽습니다', async () => {
    const readAlarmStatus = vi.fn(async () => alarmStatus);
    const readSleepReminderStatus = vi.fn(async () => sleepStatus);
    const coordinator = createAppLifecycleCoordinator({
      readAlarmStatus,
      readSleepReminderStatus,
    });

    await coordinator.refresh({ transitionId: 1, includeSleepReminder: false });
    await coordinator.refresh({ transitionId: 2, includeSleepReminder: false });
    coordinator.invalidate();
    await coordinator.refresh({ transitionId: 2, includeSleepReminder: false });

    expect(readAlarmStatus).toHaveBeenCalledTimes(3);
    expect(readSleepReminderStatus).not.toHaveBeenCalled();
  });

  it('같은 전환에서도 실제 알람 동기화 revision이 바뀌면 한 번만 다시 읽습니다', async () => {
    const readAlarmStatus = vi.fn(async () => alarmStatus);
    const coordinator = createAppLifecycleCoordinator({
      readAlarmStatus,
      readSleepReminderStatus: vi.fn(async () => sleepStatus),
    });

    await coordinator.refresh({
      transitionId: 1,
      revisionKey: 'sync-a',
      includeSleepReminder: false,
    });
    await coordinator.refresh({
      transitionId: 1,
      revisionKey: 'sync-b',
      includeSleepReminder: false,
    });
    await coordinator.refresh({
      transitionId: 1,
      revisionKey: 'sync-b',
      includeSleepReminder: false,
    });

    expect(readAlarmStatus).toHaveBeenCalledTimes(2);
  });

  it('상태 조회 실패를 공유 오류 상태로 기록하고 다음 전환에서 복구합니다', async () => {
    const readAlarmStatus = vi
      .fn<() => Promise<AlarmPyoAlarmStatus>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(alarmStatus);
    const coordinator = createAppLifecycleCoordinator({
      readAlarmStatus,
      readSleepReminderStatus: vi.fn(async () => sleepStatus),
    });

    await coordinator.refresh({ transitionId: 1, includeSleepReminder: false });
    expect(coordinator.getSnapshot()).toMatchObject({
      alarmStatus: null,
      alarmStatusError: true,
    });
    await coordinator.refresh({ transitionId: 2, includeSleepReminder: false });
    expect(coordinator.getSnapshot()).toMatchObject({
      alarmStatus,
      alarmStatusError: false,
    });
  });

  it('느리게 끝난 이전 전환이 최신 상태를 덮어쓰지 않습니다', async () => {
    let resolveFirst!: (value: AlarmPyoAlarmStatus) => void;
    let resolveSecond!: (value: AlarmPyoAlarmStatus) => void;
    const firstStatus = { supported: true, scheduledCount: 1 } as AlarmPyoAlarmStatus;
    const secondStatus = { supported: true, scheduledCount: 2 } as AlarmPyoAlarmStatus;
    const readAlarmStatus = vi
      .fn<() => Promise<AlarmPyoAlarmStatus>>()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve;
      }));
    const coordinator = createAppLifecycleCoordinator({
      readAlarmStatus,
      readSleepReminderStatus: vi.fn(async () => sleepStatus),
    });

    const first = coordinator.refresh({
      transitionId: 1,
      includeSleepReminder: false,
    });
    const second = coordinator.refresh({
      transitionId: 2,
      includeSleepReminder: false,
    });
    resolveSecond(secondStatus);
    await second;
    resolveFirst(firstStatus);
    await first;

    expect(coordinator.getSnapshot()).toMatchObject({
      alarmStatus: secondStatus,
      alarmStatusError: false,
      loading: false,
    });
  });
});
