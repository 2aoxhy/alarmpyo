import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultAppData } from '../../app-data-policy';
import { getAutomaticSaveContentSignature } from '../../app-store-persistence';
import { getAlarmScheduleSignature } from '../../../services/alarm-schedule-signature';
import type { AppStoreEngineContext, AppStoreOperations } from './engine-context';
import { AppStoreLifecycleCoordinator } from './lifecycle-coordinator';
import { AppStoreMutationQueue } from './mutation-queue';

function fixture() {
  vi.useFakeTimers();
  const data = createDefaultAppData('2026-09-06');
  const state = { data, ready: true };
  const queue = new AppStoreMutationQueue();
  // Only the state/queue/ref boundary consumed by this coordinator is faked.
  const context = {
    state: { getSnapshot: () => state },
    dataRef: { current: data },
    readyRef: { current: true },
    mutationCoordinator: queue,
    automaticSaveTimerRef: { current: null as ReturnType<typeof setTimeout> | null },
    automaticSaveGenerationRef: { current: 0 },
    automaticSaveAppliedCanonicalSnapshotRef: { current: null },
    lastPersistedAutomaticSaveSignatureRef: {
      current: getAutomaticSaveContentSignature(data),
    },
    lastAlarmSyncSignatureRef: { current: null as string | null },
    failedAlarmSyncSignatureRef: { current: null as string | null },
  };
  const operations = {
    resyncAlarms: vi.fn(async () => true),
    syncSleepRemindersForSnapshot: vi.fn(async () => true),
    flushAutomaticSave: vi.fn(async () => true),
  };
  const coordinator = new AppStoreLifecycleCoordinator(
    context as unknown as AppStoreEngineContext,
    operations as unknown as AppStoreOperations,
  );
  const drain = () => queue.run(async () => undefined);
  const changeData = () => {
    state.data = { ...state.data, notes: { '2026-09-06': '보존할 메모' } };
    context.dataRef.current = state.data;
    coordinator.reconcile();
  };
  return { context, coordinator, operations, queue, drain, changeData };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('자동 동기화의 foreground 수명', () => {
  it('백그라운드에서는 500ms 점검을 보류하고 복귀 후 한 번 실행합니다', async () => {
    const f = fixture();
    f.coordinator.start();
    f.coordinator.update({ active: false, transitionId: 0 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.operations.resyncAlarms).not.toHaveBeenCalled();
    expect(f.operations.syncSleepRemindersForSnapshot).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    f.coordinator.update({ active: true, transitionId: 1 });
    await vi.advanceTimersByTimeAsync(499);
    expect(f.operations.resyncAlarms).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.operations.resyncAlarms).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.operations.resyncAlarms).toHaveBeenCalledTimes(1);
  });

  it('백그라운드에서 준비된 엔진도 복귀 전 자동 작업을 시작하지 않습니다', async () => {
    const f = fixture();
    f.coordinator.update({ active: false, transitionId: 0 });
    f.coordinator.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.operations.resyncAlarms).not.toHaveBeenCalled();
    expect(f.operations.syncSleepRemindersForSnapshot).not.toHaveBeenCalled();
    f.coordinator.update({ active: true, transitionId: 1 });
    await vi.advanceTimersByTimeAsync(500);
    expect(f.operations.resyncAlarms).toHaveBeenCalledTimes(1);
    expect(f.operations.syncSleepRemindersForSnapshot).toHaveBeenCalledTimes(1);
  });

  it('빠른 background/resume 왕복과 동일 상태 반복은 점검 타이머를 쌓지 않습니다', async () => {
    const f = fixture();
    f.coordinator.start();
    for (let transitionId = 1; transitionId <= 5; transitionId += 1) {
      f.coordinator.update({ active: false, transitionId: transitionId - 1 });
      f.coordinator.update({ active: true, transitionId });
      f.coordinator.update({ active: true, transitionId });
      await vi.advanceTimersByTimeAsync(100);
      expect(vi.getTimerCount()).toBe(1);
    }
    await vi.advanceTimersByTimeAsync(500);
    expect(f.operations.resyncAlarms).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('저장 큐 뒤에서 대기하던 이전 foreground의 수면 점검은 실행하지 않습니다', async () => {
    const f = fixture();
    let release!: () => void;
    const blocker = f.queue.run(() => new Promise<void>((resolve) => { release = resolve; }));
    await Promise.resolve();
    f.coordinator.start();
    f.coordinator.update({ active: false, transitionId: 0 });
    release();
    await blocker;
    await f.drain();
    expect(f.operations.syncSleepRemindersForSnapshot).not.toHaveBeenCalled();
    f.coordinator.update({ active: true, transitionId: 1 });
    await f.drain();
    expect(f.operations.syncSleepRemindersForSnapshot).toHaveBeenCalledTimes(1);
  });

  it('stop/start 이전의 큐 작업과 지연 타이머는 새 세션에서 중복 실행되지 않습니다', async () => {
    const f = fixture();
    let release!: () => void;
    const blocker = f.queue.run(() => new Promise<void>((resolve) => { release = resolve; }));
    await Promise.resolve();
    f.coordinator.start();
    f.coordinator.stop();
    f.coordinator.start();
    release();
    await blocker;
    await f.drain();
    await vi.advanceTimersByTimeAsync(500);
    expect(f.operations.syncSleepRemindersForSnapshot).toHaveBeenCalledTimes(1);
    expect(f.operations.resyncAlarms).toHaveBeenCalledTimes(1);
  });

  it('자동 점검을 보류해도 background 진입 시 저장 flush는 유지합니다', async () => {
    const f = fixture();
    f.coordinator.start();
    f.changeData();
    f.coordinator.update({ active: false, transitionId: 0 });
    expect(f.operations.flushAutomaticSave).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.operations.flushAutomaticSave).toHaveBeenCalledTimes(1);
    expect(f.operations.resyncAlarms).not.toHaveBeenCalled();
  });

  it('대기 중 명시적 저장이 이미 동기화한 서명은 복귀 시 다시 예약하지 않습니다', async () => {
    const f = fixture();
    f.coordinator.start();
    f.coordinator.update({ active: false, transitionId: 0 });
    f.context.lastAlarmSyncSignatureRef.current = getAlarmScheduleSignature(f.context.dataRef.current);
    f.coordinator.update({ active: true, transitionId: 1 });
    await vi.advanceTimersByTimeAsync(500);
    expect(f.operations.resyncAlarms).not.toHaveBeenCalled();
  });
});
