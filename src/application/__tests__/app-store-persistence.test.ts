import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../services/app-data-service';
import { getAlarmScheduleSignature } from '../../services/alarm-schedule-signature';
import { getSleepReminderScheduleSignature } from '../../services/sleep-reminder-planner';
import { createSerializedMutationCoordinator } from '../../services/app-storage-service';
// @ts-expect-error Vitest는 회귀 계약 검사를 위해 소스 파일을 문자열로 불러와요.
import providerSource from '../../store/app-store.tsx?raw';

import {
  applyCanonicalSnapshotIfSourceIsCurrent,
  createDataReplacementResult,
  getResetAllDataResult,
  getSleepReminderSyncModeForAppState,
  persistLatestCanonicalSnapshotAndSyncSleep,
  shouldClearSleepReminderSaveError,
  shouldSkipAutomaticSaveForAppliedCanonicalSnapshot,
  shouldSyncAlarmsAfterReplacement,
  shouldSyncSleepRemindersAfterReplacement,
  withDeviceBackupResult,
} from '../app-store-persistence';

describe('app-store-persistence', () => {
  it('본문 저장과 후속 처리 결과를 구분해요', () => {
    expect(
      createDataReplacementResult({
        primarySaved: false,
        dataApplied: false,
        followUpSucceeded: false,
      }),
    ).toEqual({
      primarySaved: false,
      operationSucceeded: false,
      announceSuccess: false,
      partialFailure: false,
    });
    expect(
      createDataReplacementResult({
        primarySaved: true,
        dataApplied: true,
        followUpSucceeded: false,
      }),
    ).toEqual({
      primarySaved: true,
      operationSucceeded: true,
      announceSuccess: false,
      partialFailure: true,
    });
    expect(
      createDataReplacementResult({
        primarySaved: true,
        dataApplied: true,
        followUpSucceeded: true,
      }),
    ).toEqual({
      primarySaved: true,
      operationSucceeded: true,
      announceSuccess: true,
      partialFailure: false,
    });
  });

  it('명시적 초기화의 본문 저장과 후속 알람 정리를 구분해요', () => {
    expect(
      getResetAllDataResult(
        createDataReplacementResult({
          primarySaved: false,
          dataApplied: false,
          followUpSucceeded: false,
        }),
      ),
    ).toEqual({
      status: 'failure',
      dataReset: false,
      reason: 'reset-failed',
    });
    expect(
      getResetAllDataResult(
        createDataReplacementResult({
          primarySaved: true,
          dataApplied: true,
          followUpSucceeded: false,
        }),
      ),
    ).toEqual({
      status: 'partial',
      dataReset: true,
      reason: 'follow-up-failed',
    });
    expect(
      getResetAllDataResult(
        createDataReplacementResult({
          primarySaved: true,
          dataApplied: true,
          followUpSucceeded: true,
        }),
      ),
    ).toEqual({ status: 'success', dataReset: true });
  });

  it('기기 파일 복사본 실패를 저장 완료와 구분해요', () => {
    expect(
      withDeviceBackupResult(
        {
          operationSucceeded: true,
          announceSuccess: true,
          partialFailure: false,
        },
        false,
      ),
    ).toEqual({
      operationSucceeded: true,
      announceSuccess: false,
      partialFailure: true,
      deviceBackupSaved: false,
    });
  });

  it('근무 알람에 영향을 주는 변경만 다시 동기화해요', () => {
    const current = createDefaultAppData('2026-08-09');
    const themeOnly = {
      ...current,
      settings: { ...current.settings, themeMode: 'dark' as const },
    };
    expect(
      shouldSyncAlarmsAfterReplacement({
        current,
        next: themeOnly,
        failedSignature: null,
        force: false,
      }),
    ).toBe(false);

    const alarmChanged = {
      ...current,
      shiftTypes: current.shiftTypes.map((shift) =>
        shift.id === 'day'
          ? { ...shift, alarmMinutesBefore: shift.alarmMinutesBefore + 1 }
          : shift,
      ),
    };
    expect(
      shouldSyncAlarmsAfterReplacement({
        current,
        next: alarmChanged,
        failedSignature: null,
        force: false,
      }),
    ).toBe(true);
    expect(
      shouldSyncAlarmsAfterReplacement({
        current,
        next: current,
        failedSignature: getAlarmScheduleSignature(current),
        force: false,
      }),
    ).toBe(true);
  });

  it('수면 계획 변경과 이전 실패를 저장 후 즉시 다시 동기화해요', () => {
    const base = createDefaultAppData('2026-08-09');
    const current = {
      ...base,
      settings: {
        ...base.settings,
        setupCompleted: true,
        sleepReminderEnabled: true,
      },
    };
    const currentSignature = getSleepReminderScheduleSignature(current);
    const themeOnly = {
      ...current,
      settings: { ...current.settings, themeMode: 'dark' as const },
    };
    expect(
      shouldSyncSleepRemindersAfterReplacement({
        current,
        next: themeOnly,
        lastSyncedSignature: currentSignature,
        failedSignature: null,
        force: false,
      }),
    ).toBe(false);

    const scheduleChanged = {
      ...current,
      shiftTypes: current.shiftTypes.map((shift, index) =>
        index === 0 && shift.startMinutes !== null
          ? { ...shift, startMinutes: shift.startMinutes + 5 }
          : shift,
      ),
    };
    expect(
      shouldSyncSleepRemindersAfterReplacement({
        current,
        next: scheduleChanged,
        lastSyncedSignature: currentSignature,
        failedSignature: null,
        force: false,
      }),
    ).toBe(true);
    expect(
      shouldSyncSleepRemindersAfterReplacement({
        current,
        next: current,
        lastSyncedSignature: currentSignature,
        failedSignature: currentSignature,
        force: false,
      }),
    ).toBe(true);
  });

  it('백그라운드 전환은 저장 flush에 맡기고 복귀만 강제 재검증해요', () => {
    expect(getSleepReminderSyncModeForAppState('active', 'inactive')).toBeNull();
    expect(getSleepReminderSyncModeForAppState('inactive', 'background')).toBeNull();
    expect(getSleepReminderSyncModeForAppState('background', 'active')).toBe('force');
    expect(getSleepReminderSyncModeForAppState('active', 'active')).toBeNull();
  });

  it('Provider는 수면 signature effect로 저장 전 네이티브 동기화를 시작하지 않아요', () => {
    expect(providerSource).not.toContain('sleepReminderScheduleSignature');
    expect(providerSource).toContain(
      '최초 로드·복구\n    // 계획만 즉시 확인해',
    );
    expect(providerSource).toContain(
      'void flushAutomaticSave(automaticSaveGenerationRef.current);',
    );
    expect(providerSource).toContain(
      'persistLatestCanonicalSnapshotAndSyncSleep({',
    );
  });

  it('본문 저장이 끝나기 전에는 수면 네이티브 동기화를 시작하지 않아요', async () => {
    const events: string[] = [];
    let finishPersistence: () => void = () => undefined;
    const persistenceGate = new Promise<void>((resolve) => {
      finishPersistence = resolve;
    });
    const operation = persistLatestCanonicalSnapshotAndSyncSleep({
      getLatestCanonicalSnapshot: () => ({ revision: 4 }),
      persist: async () => {
        events.push('persist:start');
        await persistenceGate;
        events.push('persist:complete');
        return { operationSucceeded: true, partialFailure: false };
      },
      isPersistenceComplete: (result) =>
        result.operationSucceeded && !result.partialFailure,
      syncSleepReminders: async () => {
        events.push('sleep');
        return true;
      },
    });

    await Promise.resolve();
    expect(events).toEqual(['persist:start']);
    finishPersistence();
    await operation;
    expect(events).toEqual(['persist:start', 'persist:complete', 'sleep']);
  });

  it('백그라운드 flush는 실행 시점의 최신 canonical 자료를 저장한 뒤 같은 객체로 수면 계획을 동기화해요', async () => {
    const coordinator = createSerializedMutationCoordinator();
    const events: string[] = [];
    let releasePendingSave: () => void = () => undefined;
    const pendingSaveGate = new Promise<void>((resolve) => {
      releasePendingSave = resolve;
    });
    let latest = { revision: 1, value: '이전 자료' };
    let persistedSnapshot: Readonly<typeof latest> | null = null;
    let sleepSnapshot: Readonly<typeof latest> | null = null;

    const pendingSave = coordinator.run(() => pendingSaveGate);
    const backgroundFlush = coordinator.run(() =>
      persistLatestCanonicalSnapshotAndSyncSleep({
        getLatestCanonicalSnapshot: () => Object.freeze({ ...latest }),
        persist: async (snapshot) => {
          events.push(`persist:${snapshot.revision}`);
          persistedSnapshot = snapshot;
          return { operationSucceeded: true, partialFailure: false };
        },
        isPersistenceComplete: (result) =>
          result.operationSucceeded && !result.partialFailure,
        syncSleepReminders: async (snapshot) => {
          events.push(`sleep:${snapshot.revision}`);
          sleepSnapshot = snapshot;
          return true;
        },
      }),
    );

    latest = { revision: 2, value: '최신 자료' };
    releasePendingSave();
    await pendingSave;
    const result = await backgroundFlush;

    expect(events).toEqual(['persist:2', 'sleep:2']);
    expect(persistedSnapshot).toBe(result.canonicalSnapshot);
    expect(sleepSnapshot).toBe(result.canonicalSnapshot);
    expect(result.canonicalSnapshot).toEqual(latest);
  });

  it('자동 flush의 canonical 객체는 더 최신 변경을 덮어쓰지 않고 React 상태에도 그대로 적용해요', () => {
    const source = { revision: 1 };
    const canonical = { revision: 1 };
    let current = source;
    let applied: typeof source | null = null;

    expect(
      applyCanonicalSnapshotIfSourceIsCurrent({
        sourceSnapshot: source,
        canonicalSnapshot: canonical,
        getCurrentSnapshot: () => current,
        applyCanonicalSnapshot: (snapshot) => {
          current = snapshot;
          applied = snapshot;
        },
      }),
    ).toBe(true);
    expect(current).toBe(canonical);
    expect(applied).toBe(canonical);

    const newer = { revision: 2 };
    current = newer;
    applied = null;
    expect(
      applyCanonicalSnapshotIfSourceIsCurrent({
        sourceSnapshot: canonical,
        canonicalSnapshot: { revision: 1 },
        getCurrentSnapshot: () => current,
        applyCanonicalSnapshot: (snapshot) => {
          current = snapshot;
          applied = snapshot;
        },
      }),
    ).toBe(false);
    expect(current).toBe(newer);
    expect(applied).toBeNull();
  });

  it('자동 flush가 반영한 같은 canonical 객체는 한 번 더 저장하지 않고, 후속 런타임 상태는 저장해요', () => {
    const canonical = createDefaultAppData('2026-08-09');
    const runtimeState = {
      ...canonical,
      settings: {
        ...canonical.settings,
        scheduledNotificationCount: 2,
        lastNotificationSyncAt: '2026-08-09T00:00:00.000Z',
      },
    };

    expect(
      shouldSkipAutomaticSaveForAppliedCanonicalSnapshot(canonical, canonical),
    ).toBe(true);
    expect(
      shouldSkipAutomaticSaveForAppliedCanonicalSnapshot(runtimeState, canonical),
    ).toBe(false);
    expect(getAlarmScheduleSignature(runtimeState)).toBe(
      getAlarmScheduleSignature(canonical),
    );
  });

  it('수면 알림 복구 성공은 현재 오류가 수면 동기화 오류일 때만 저장 상태를 복구해요', () => {
    expect(
      shouldClearSleepReminderSaveError({
        failureRevision: 7,
        currentRevision: 7,
        currentErrorSource: 'sleep-reminder',
      }),
    ).toBe(true);
    expect(
      shouldClearSleepReminderSaveError({
        failureRevision: 7,
        currentRevision: 7,
        currentErrorSource: 'other',
      }),
    ).toBe(false);
    expect(
      shouldClearSleepReminderSaveError({
        failureRevision: 7,
        currentRevision: 8,
        currentErrorSource: 'sleep-reminder',
      }),
    ).toBe(false);
  });

  it('안전 백업이 부분 실패한 flush는 수면 성공 처리로 저장 오류를 덮지 않아요', async () => {
    let sleepSyncCount = 0;
    const result = await persistLatestCanonicalSnapshotAndSyncSleep({
      getLatestCanonicalSnapshot: () => ({ revision: 3 }),
      persist: async () => ({
        operationSucceeded: true,
        partialFailure: true,
      }),
      isPersistenceComplete: (persistence) =>
        persistence.operationSucceeded && !persistence.partialFailure,
      syncSleepReminders: async () => {
        sleepSyncCount += 1;
        return true;
      },
    });

    expect(result.sleepReminderSyncSucceeded).toBeNull();
    expect(sleepSyncCount).toBe(0);
  });

  it('자료 저장 뒤 수면 동기화만 실패하면 실패로 구분하고 다음 foreground 동기화에서 재시도할 수 있어요', async () => {
    const data = createDefaultAppData('2026-08-09');
    data.settings.setupCompleted = true;
    data.settings.sleepReminderEnabled = true;
    const events: string[] = [];
    let sleepAttempt = 0;
    const syncSleepReminders = async () => {
      sleepAttempt += 1;
      events.push(`sleep:${sleepAttempt}`);
      return sleepAttempt > 1;
    };
    const run = () => persistLatestCanonicalSnapshotAndSyncSleep({
      getLatestCanonicalSnapshot: () => data,
      persist: async () => {
        events.push('persisted');
        return { operationSucceeded: true, partialFailure: false };
      },
      isPersistenceComplete: (result) =>
        result.operationSucceeded && !result.partialFailure,
      syncSleepReminders,
    });

    const first = await run();
    expect(first.sleepReminderSyncSucceeded).toBe(false);
    expect(first.persistence.operationSucceeded).toBe(true);
    expect(
      shouldSyncSleepRemindersAfterReplacement({
        current: data,
        next: data,
        lastSyncedSignature: null,
        failedSignature: getSleepReminderScheduleSignature(data),
        force: false,
      }),
    ).toBe(true);
    expect(getSleepReminderSyncModeForAppState('background', 'active')).toBe('force');

    const foregroundRetrySucceeded = await syncSleepReminders();
    expect(foregroundRetrySucceeded).toBe(true);
    expect(events).toEqual(['persisted', 'sleep:1', 'sleep:2']);
  });
});
