/* eslint-disable no-restricted-imports -- Integration composition intentionally binds real codecs/storage to fake device ports. Production graph is tested separately. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultAppData,
  exportAppDataToJson,
  serializeAppData,
} from '../../services/app-data-service';
import {
  APP_DATA_STORAGE_KEY,
  APP_DATA_LAST_KNOWN_GOOD_KEY,
  APP_DATA_AUTOMATIC_BACKUP_KEY,
  APP_DATA_PENDING_RESTORE_BACKUP_KEY,
} from '../../services/app-storage-service';
import type { AppData } from '../../models/app-data';
import type { AlarmPyoAlarmStatus } from '../../services/alarmpyo-alarm-service';
import { AppRuntimeController } from './app-runtime-controller';
import { AppStoreEngine } from './app-store-engine';
import type { AppStoreEnginePorts, AppStoreRuntimeContract } from './store/engine-ports';
import { createAppStoreStoragePort } from '../../infrastructure/runtime/app-store-storage-adapter';
import { appDataCodec } from '../../infrastructure/runtime/app-data-codec-adapter';

const now = new Date(2026, 8, 6, 12, 0, 0);
const initialData = (): AppData => {
  const data = createDefaultAppData('2026-09-06');
  return {
    ...data,
    settings: {
      ...data.settings,
      setupCompleted: true,
      notificationsEnabled: false,
      sleepReminderEnabled: false,
    },
  };
};
const alarmStatus: AlarmPyoAlarmStatus = {
  supported: true,
  enabled: false,
  triggerState: 'not-scheduled',
  storageHealth: 'normal',
  exactAlarmAllowed: true,
  fullScreenAllowed: true,
  notificationsAllowed: true,
  doNotDisturbActive: false,
  doNotDisturbMaySilenceAlarm: false,
  batteryOptimizationIgnored: true,
  alarmVolume: 5,
  plannedThroughAt: 0,
  planRefreshRecommendedAt: 0,
  planRefreshReminderPending: false,
  scheduledAlarms: [],
  scheduledCount: 0,
  widgetInstalled: false,
  widgetSnapshotGeneratedAt: 0,
  recentEvents: [],
};

function harness(data = initialData()) {
  const values = new Map<string, string>([
    [APP_DATA_STORAGE_KEY, serializeAppData(data)],
    [APP_DATA_LAST_KNOWN_GOOD_KEY, exportAppDataToJson(data, now)],
  ]);
  const events: string[] = [];
  const failures = { writeKey: '', backup: false, alarms: false, sleep: false };
  const repository = {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      events.push(`write:${key}`);
      if (failures.writeKey === key) throw new Error('storage failed');
      values.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      events.push(`remove:${key}`);
      values.delete(key);
    }),
  };
  const runtime = new AppRuntimeController<AppStoreRuntimeContract>({
    dataRepository: repository,
    clock: { now: () => new Date(now) },
    alarms: {
      readStatus: vi.fn(async () => alarmStatus),
      requestPermissions: vi.fn(async () => alarmStatus),
      synchronize: vi.fn(async (plans) => {
        events.push('alarms:sync');
        if (failures.alarms) throw new Error('alarm failed');
        return {
          ...alarmStatus,
          enabled: true,
          scheduledCount: plans.length,
          scheduledAlarms: [...plans],
        };
      }),
      cancelAll: vi.fn(async () => {
        events.push('alarms:cancel-all');
        if (failures.alarms) throw new Error('alarm failed');
        return alarmStatus;
      }),
    },
    sleepReminders: {
      synchronize: vi.fn(async (plans) => {
        events.push('sleep:sync');
        if (failures.sleep) throw new Error('sleep failed');
        return {
          supported: true,
          enabled: plans.length > 0,
          notificationsAllowed: true,
          scheduledCount: plans.length,
        };
      }),
      cancelAll: vi.fn(async () => {
        events.push('sleep:cancel');
        if (failures.sleep) throw new Error('sleep failed');
        return { supported: true, enabled: false, notificationsAllowed: true, scheduledCount: 0 };
      }),
      requestPermission: vi.fn(async () => ({
        supported: true,
        enabled: false,
        notificationsAllowed: true,
        scheduledCount: 0,
      })),
    },
    widget: {
      isInstalled: vi.fn(async () => true),
      synchronize: vi.fn(async () => {
        events.push('widget:sync');
        return true;
      }),
    },
    backup: {
      readLatest: vi.fn(async () => null),
      write: vi.fn(async () => {
        events.push('backup:file');
        return !failures.backup;
      }),
    },
  });
  const platform: AppStoreEnginePorts['platform'] = {
    quarantineCorruptAppData: vi.fn(async () => null),
    clearPlayUpdatePromptSnooze: vi.fn(async () => undefined),
    clearQuickSetupDraft: vi.fn(async () => undefined),
    clearResetCleanupJournal: vi.fn(async () => undefined),
    prepareResetCleanupJournal: vi.fn(async () => undefined),
    resumeResetCleanupJournal: vi.fn(async () => ({ completed: true })),
    scheduleAlarmPyoTestAlarm: vi.fn(async () => undefined),
    cancelQuickTimerForResetCleanup: vi.fn(async () => undefined),
    resetAlarmRuntimeForResetCleanup: vi.fn(async () => undefined),
    widgetSupported: false,
    supportsGeneratedWidgetPreview: false,
  };
  const storage = createAppStoreStoragePort(repository, platform.quarantineCorruptAppData);
  const engine = new AppStoreEngine({ runtime, platform, storage, codec: appDataCodec });
  return { engine, events, values, failures, repository, runtime, platform };
}

const engines: AppStoreEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.stop();
  vi.useRealTimers();
});

async function start(data?: AppData) {
  vi.useFakeTimers();
  const h = harness(data);
  engines.push(h.engine);
  await h.engine.start();
  await vi.advanceTimersByTimeAsync(550);
  h.events.length = 0;
  return h;
}

describe('AppStoreEngine integrated persistence and lifecycle', () => {
  it('publishes stable immutable snapshots and stable commands, without React', async () => {
    const { engine } = await start();
    const before = engine.getSnapshot();
    const commands = engine.commands;
    expect(before.ready).toBe(true);
    expect(engine.getSnapshot()).toBe(before);
    expect(Object.isFrozen(before.data)).toBe(true);
    expect(Object.isFrozen(before.data.pattern.shiftTypeIds)).toBe(true);
    await engine.commands.dismissPlayUpdate(23);
    expect(engine.commands).toBe(commands);
    expect(engine.getSnapshot().data.pattern).toBe(before.data.pattern);
    expect(engine.getSnapshot().data.shiftTypes).toBe(before.data.shiftTypes);
  });

  it('does not apply an edit or synchronize alarms when the primary save fails', async () => {
    const h = await start();
    const before = h.engine.getSnapshot().data;
    h.failures.writeKey = APP_DATA_STORAGE_KEY;
    expect(await h.engine.commands.saveDay('2026-09-06', 'pattern', 'not saved')).toBe(false);
    expect(h.engine.getSnapshot().data).toBe(before);
    expect(JSON.parse(h.values.get(APP_DATA_STORAGE_KEY)!).notes).toEqual(before.notes);
    expect(h.events).not.toContain('alarms:sync');
    expect(
      h.engine
        .getSnapshot()
        .saveOutcome?.issues.some((issue) => issue.issueCode === 'primary-save-failed'),
    ).toBe(true);
  });

  it.each(['lkg', 'file'] as const)(
    'preserves primary success and reports %s backup partial failure',
    async (kind) => {
      const h = await start();
      if (kind === 'lkg') h.failures.writeKey = APP_DATA_LAST_KNOWN_GOOD_KEY;
      else h.failures.backup = true;
      expect(await h.engine.commands.saveDay('2026-09-06', 'pattern', 'saved note')).toBe(true);
      expect(h.engine.getSnapshot().data.notes['2026-09-06']).toBe('saved note');
      expect(JSON.parse(h.values.get(APP_DATA_STORAGE_KEY)!).notes['2026-09-06']).toBe(
        'saved note',
      );
      expect(h.engine.getSnapshot().saveStatus).toBe('error');
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.engine.getSnapshot().saveStatus).toBe('error');
    },
  );

  it('persists alarm OFF before cancelAll and retains OFF if native cancellation fails', async () => {
    const data = initialData();
    data.settings.notificationsEnabled = true;
    const h = await start(data);
    h.failures.alarms = true;
    await h.engine.commands.disableAlarms();
    expect(h.events.indexOf(`write:${APP_DATA_STORAGE_KEY}`)).toBeLessThan(
      h.events.indexOf('alarms:cancel-all'),
    );
    expect(h.events).not.toContain('alarms:sync');
    expect(h.engine.getSnapshot().data.settings.notificationsEnabled).toBe(false);
    expect(JSON.parse(h.values.get(APP_DATA_STORAGE_KEY)!).settings.notificationsEnabled).toBe(
      false,
    );
    expect(h.engine.getSnapshot().alarmSyncStatus).toBe('error');
  });

  it('still commits an explicit alarm OFF command when automatic work is backgrounded', async () => {
    const data = initialData();
    data.settings.notificationsEnabled = true;
    const h = await start(data);
    h.engine.updateLifecycle({ active: false, transitionId: 0 });
    await h.engine.commands.disableAlarms();
    expect(h.events.indexOf(`write:${APP_DATA_STORAGE_KEY}`)).toBeLessThan(
      h.events.indexOf('alarms:cancel-all'),
    );
    expect(h.engine.getSnapshot().data.settings.notificationsEnabled).toBe(false);
    expect(JSON.parse(h.values.get(APP_DATA_STORAGE_KEY)!).settings.notificationsEnabled).toBe(false);
  });

  it('defers boot alarm observation while inactive and resumes one automatic observation', async () => {
    vi.useFakeTimers();
    const h = harness();
    engines.push(h.engine);
    const readStatus = vi.spyOn(h.runtime, 'readAlarmStatus');
    h.engine.updateLifecycle({ active: false, transitionId: 0 });
    await h.engine.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(readStatus).not.toHaveBeenCalled();
    h.engine.updateLifecycle({ active: true, transitionId: 1 });
    await vi.advanceTimersByTimeAsync(550);
    expect(readStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(readStatus).toHaveBeenCalledTimes(1);
  });

  it('serializes rapid edits and retains the last edit after background flush and restart', async () => {
    const h = await start();
    await Promise.all(
      ['A', 'B', 'A'].map((note) => h.engine.commands.saveDay('2026-09-06', 'pattern', note)),
    );
    h.engine.updateLifecycle({ active: false, transitionId: 0 });
    await vi.advanceTimersByTimeAsync(350);
    expect(JSON.parse(h.values.get(APP_DATA_STORAGE_KEY)!).notes['2026-09-06']).toBe('A');
    h.engine.stop();
    expect(await h.engine.start()).toBe(true);
    expect(h.engine.getSnapshot().data.notes['2026-09-06']).toBe('A');
  });

  it('handles StrictMode start/stop/start while an earlier load is pending', async () => {
    vi.useFakeTimers();
    const h = harness();
    engines.push(h.engine);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.repository.getItem.mockImplementationOnce(async (key) => {
      await delayed;
      return h.values.get(key) ?? null;
    });
    const first = h.engine.start();
    await Promise.resolve();
    h.engine.stop();
    const second = h.engine.start();
    release();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(h.engine.getSnapshot().ready).toBe(true);
    expect(await h.engine.commands.saveDay('2026-09-06', 'pattern', 'after restart')).toBe(true);
  });

  it('does not notify a calendar slice subscriber for unrelated settings', async () => {
    const h = await start();
    const subscription = h.engine.selectors.createSubscription((state) => state.data.pattern);
    const listener = vi.fn();
    const unsubscribe = subscription.subscribe(listener);
    await h.engine.commands.dismissPlayUpdate(23);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('repairs a corrupt pending journal inside the restore transaction before replacing it', async () => {
    const h = await start();
    const backup = { ...initialData(), notes: { '2026-09-06': 'restored' } };
    h.values.set(APP_DATA_AUTOMATIC_BACKUP_KEY, exportAppDataToJson(backup, now));
    h.values.set(APP_DATA_PENDING_RESTORE_BACKUP_KEY, '{broken');
    const result = await h.engine.commands.restoreLatestBackup();
    expect(result.status).toBe('success');
    expect(h.engine.getSnapshot().data.notes['2026-09-06']).toBe('restored');
  });

  it('finishes a pending disk write without emitting after stop, then reloads it on start', async () => {
    const h = await start();
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      entered = resolve;
    });
    h.repository.setItem.mockImplementation(async (key, value) => {
      if (key === APP_DATA_STORAGE_KEY) {
        entered();
        await pending;
      }
      h.values.set(key, value);
    });
    const saving = h.engine.commands.saveDay('2026-09-06', 'pattern', 'durable');
    await began;
    h.engine.stop();
    const snapshot = h.engine.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = h.engine.subscribe(listener);
    release();
    await saving;
    expect(listener).not.toHaveBeenCalled();
    expect(h.engine.getSnapshot()).toBe(snapshot);
    expect(JSON.parse(h.values.get(APP_DATA_STORAGE_KEY)!).notes['2026-09-06']).toBe('durable');
    await h.engine.start();
    expect(h.engine.getSnapshot().data.notes['2026-09-06']).toBe('durable');
    unsubscribe();
  });

  it('rejects an old alarm observation after stop/start before a new boot reports status', async () => {
    const h = await start();
    let release!: (value: AlarmPyoAlarmStatus) => void;
    let entered!: () => void;
    const observation = new Promise<AlarmPyoAlarmStatus>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.spyOn(h.runtime, 'readAlarmStatus').mockImplementationOnce(() => {
      entered();
      return observation;
    });
    const checking = h.engine.commands.resyncAlarms(true);
    await began;
    h.engine.stop();
    const restarting = h.engine.start();
    release(alarmStatus);
    expect(await checking).toBe(false);
    expect(await restarting).toBe(true);
    expect(h.engine.getSnapshot().alarmAutoCheckState.status).toBe('idle');
    expect(h.events).not.toContain('alarms:sync');
  });

  it('keeps widget projection and synchronization unchanged for an unrelated update setting', async () => {
    vi.useFakeTimers();
    const h = harness();
    engines.push(h.engine);
    h.platform.widgetSupported = true;
    await h.engine.start();
    await vi.advanceTimersByTimeAsync(550);
    const count = h.events.filter((event) => event === 'widget:sync').length;
    expect(count).toBeGreaterThan(0);
    await h.engine.commands.dismissPlayUpdate(23);
    await vi.advanceTimersByTimeAsync(550);
    expect(h.events.filter((event) => event === 'widget:sync')).toHaveLength(count);
  });

  it('does not enable alarms from a permission response belonging to an earlier engine session', async () => {
    const h = await start();
    let release!: (status: AlarmPyoAlarmStatus) => void;
    const permission = new Promise<AlarmPyoAlarmStatus>((resolve) => {
      release = resolve;
    });
    vi.spyOn(h.runtime, 'requestAlarmPermissions').mockReturnValueOnce(permission);
    const enabling = h.engine.commands.enableAlarms();
    h.engine.stop();
    await h.engine.start();
    release(alarmStatus);
    expect(await enabling).toBe(false);
    expect(h.engine.getSnapshot().data.settings.notificationsEnabled).toBe(false);
    expect(JSON.parse(h.values.get(APP_DATA_STORAGE_KEY)!).settings.notificationsEnabled).toBe(
      false,
    );
  });

  it('does not publish an earlier sleep sync as successful after stop/start', async () => {
    const h = await start();
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.spyOn(h.runtime, 'cancelAllSleepReminders').mockImplementationOnce(async () => {
      entered();
      await pending;
      return { supported: true, enabled: false, notificationsAllowed: true, scheduledCount: 0 };
    });
    const syncing = h.engine.commands.retrySleepReminderSync();
    await began;
    h.engine.stop();
    const restarted = h.engine.start();
    release();
    expect(await syncing).toBe(false);
    expect(await restarted).toBe(true);
    expect(h.engine.getSnapshot().sleepReminderSyncStatus).not.toBe('error');
    expect(
      h.engine
        .getSnapshot()
        .saveOutcome?.issues.some((issue) => issue.issueCode === 'sleep-reminder-sync-failed'),
    ).not.toBe(true);
  });

  it('deletes an applied pattern without deleting current calendar overrides or notes', async () => {
    const h = await start();
    const saved = await h.engine.commands.saveUserPattern({
      name: '교대 순서',
      anchorDate: '2026-09-06',
      shiftCodes: ['DAY', 'DAY', 'NIGHT', 'NIGHT', 'OFF', 'OFF'],
    });
    if (saved.status !== 'saved') throw new Error('fixture pattern was not saved');
    const applied = await h.engine.commands.applyPatternFromVault({
      patternId: saved.patternId,
      effectiveDate: '2026-09-06',
      overridePolicy: { mode: 'preserve' },
    });
    expect(applied.status).toBe('success');
    await h.engine.commands.saveDay('2026-09-07', 'night', '남길 메모');
    const before = h.engine.getSnapshot().data;
    expect((await h.engine.commands.deletePattern(saved.patternId)).status).toBe('deleted');
    const after = h.engine.getSnapshot().data;
    expect(after.pattern).toBe(before.pattern);
    expect(after.overrides).toBe(before.overrides);
    expect(after.notes).toBe(before.notes);
    expect(after.patternVault).toHaveLength(0);
    expect(after.appliedPatternId).toBeNull();
  });

  it('rolls a pattern deletion back within the same mutation queue after native sync fails', async () => {
    const h = await start();
    const saved = await h.engine.commands.saveUserPattern({
      name: '보관 순서',
      anchorDate: '2026-09-06',
      shiftCodes: ['DAY', 'NIGHT', 'OFF', 'OFF'],
    });
    if (saved.status !== 'saved') throw new Error('fixture pattern was not saved');
    const before = h.engine.getSnapshot().data;
    vi.spyOn(h.runtime, 'cancelAllAlarms').mockRejectedValueOnce(new Error('native failed once'));
    expect(await h.engine.commands.deletePattern(saved.patternId)).toMatchObject({
      status: 'failure',
      reason: 'sync-failed',
      rolledBack: true,
    });
    expect(h.engine.getSnapshot().data.patternVault).toEqual(before.patternVault);
    expect(JSON.parse(h.values.get(APP_DATA_STORAGE_KEY)!).patternVault).toEqual(
      before.patternVault,
    );
    expect(await h.engine.commands.saveDay('2026-09-06', 'pattern', 'queue still works')).toBe(
      true,
    );
  });
});
