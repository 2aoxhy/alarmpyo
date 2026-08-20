import { describe, expect, it, vi } from 'vitest';

import { AppRuntimeController } from './app-runtime-controller';
import type { AppRuntimeContract } from './app-runtime-ports';

interface TestRuntimeContract extends AppRuntimeContract {
  data: { value: number };
  alarmPlan: { id: string };
  alarmStatus: { scheduledCount: number };
  alarmMetadata: { timeZone: string };
  sleepPlan: { at: number };
  sleepStatus: { scheduledCount: number };
  widgetSnapshot: { generatedAt: number };
  backup: { data: { value: number } };
}

describe('AppRuntimeController', () => {
  it('delegates platform work without changing runtime payloads', async () => {
    const alarmStatus = { scheduledCount: 1 };
    const sleepStatus = { scheduledCount: 2 };
    const alarms = {
      readStatus: vi.fn(async () => alarmStatus),
      requestPermissions: vi.fn(async () => alarmStatus),
      synchronize: vi.fn(async () => alarmStatus),
      cancelAll: vi.fn(async () => alarmStatus),
    };
    const sleepReminders = {
      synchronize: vi.fn(async () => sleepStatus),
      cancelAll: vi.fn(async () => sleepStatus),
      requestPermission: vi.fn(async () => sleepStatus),
    };
    const widget = {
      isInstalled: vi.fn(async () => true),
      synchronize: vi.fn(async () => true),
    };
    const backup = {
      readLatest: vi.fn(async () => ({ data: { value: 3 } })),
      write: vi.fn(async () => true),
    };
    const now = new Date('2026-08-21T01:02:03.000Z');
    const controller = new AppRuntimeController<TestRuntimeContract>({
      dataRepository: {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => undefined),
        removeItem: vi.fn(async () => undefined),
      },
      alarms,
      sleepReminders,
      widget,
      backup,
      clock: { now: () => now },
    });

    const alarmPlans = [{ id: 'alarm-1' }];
    const alarmMetadata = { timeZone: 'Asia/Seoul' };
    const sleepPlans = [{ at: 123 }];
    const widgetSnapshot = { generatedAt: 456 };
    const data = { value: 7 };

    await expect(controller.readAlarmStatus()).resolves.toBe(alarmStatus);
    await expect(controller.requestAlarmPermissions()).resolves.toBe(alarmStatus);
    await expect(
      controller.synchronizeAlarms(alarmPlans, alarmMetadata),
    ).resolves.toBe(alarmStatus);
    await expect(controller.cancelAllAlarms()).resolves.toBe(alarmStatus);
    await expect(
      controller.synchronizeSleepReminders(sleepPlans),
    ).resolves.toBe(sleepStatus);
    await expect(controller.cancelAllSleepReminders()).resolves.toBe(sleepStatus);
    await expect(controller.requestSleepReminderPermission()).resolves.toBe(sleepStatus);
    await expect(controller.isWidgetInstalled()).resolves.toBe(true);
    await expect(controller.synchronizeWidget(widgetSnapshot)).resolves.toBe(true);
    await expect(controller.readLatestBackup()).resolves.toEqual({ data: { value: 3 } });
    await expect(controller.writeBackup(data)).resolves.toBe(true);

    expect(alarms.synchronize).toHaveBeenCalledWith(alarmPlans, alarmMetadata);
    expect(sleepReminders.synchronize).toHaveBeenCalledWith(sleepPlans);
    expect(widget.synchronize).toHaveBeenCalledWith(widgetSnapshot);
    expect(backup.write).toHaveBeenCalledWith(data, now);
    expect(controller.now()).toBe(now);
  });
});
