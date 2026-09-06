import {
  getAutomaticSaveContentSignature,
  shouldFlushAutomaticSave,
  shouldSkipAutomaticSaveForAppliedCanonicalSnapshot,
} from '../../app-store-persistence';
import { getAlarmScheduleSignature } from '../../../services/alarm-schedule-signature';
import type {
  AppStoreEngineContext,
  AppStoreEngineState,
  AppStoreOperations,
} from './engine-context';
import type { AppStoreLifecycle } from './engine-ports';

export class AppStoreLifecycleCoordinator {
  private lifecycle: AppStoreLifecycle = { active: true, transitionId: 0 };
  private enabled = false;
  private previousData: AppStoreEngineState['data'] | null = null;
  private previouslyReady = false;
  private previousAlarmSignature: string | null = null;
  private alarmTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly context: AppStoreEngineContext,
    private readonly operations: AppStoreOperations,
  ) {}

  start(): void {
    this.enabled = true;
    this.reconcile();
  }

  stop(): void {
    this.enabled = false;
    this.previouslyReady = false;
    this.previousData = null;
    this.previousAlarmSignature = null;
    this.clearAutomaticTimer();
    if (this.alarmTimer !== null) clearTimeout(this.alarmTimer);
    this.alarmTimer = null;
  }

  update(next: AppStoreLifecycle): void {
    const resumed = next.active && next.transitionId > this.lifecycle.transitionId;
    const backgrounded = !next.active && this.lifecycle.active;
    this.lifecycle = next;
    if (!this.enabled || !this.context.readyRef.current) return;
    if (backgrounded) this.flush();
    if (resumed) {
      void this.context.mutationCoordinator.run(() =>
        this.operations.syncSleepRemindersForSnapshot(this.context.dataRef.current),
      );
    }
  }

  reconcile(): void {
    if (!this.enabled) return;
    const snapshot = this.context.state.getSnapshot();
    const becameReady = snapshot.ready && !this.previouslyReady;
    const dataChanged = snapshot.data !== this.previousData;
    this.previouslyReady = snapshot.ready;
    this.previousData = snapshot.data;
    if (!snapshot.ready) return;
    if (becameReady) {
      void this.context.mutationCoordinator.run(() =>
        this.operations.syncSleepRemindersForSnapshot(this.context.dataRef.current),
      );
    }
    if (becameReady || dataChanged) {
      this.scheduleAutomaticSave(snapshot);
      const signature = getAlarmScheduleSignature(snapshot.data);
      if (signature !== this.previousAlarmSignature || becameReady) {
        this.previousAlarmSignature = signature;
        if (this.alarmTimer !== null) clearTimeout(this.alarmTimer);
        this.alarmTimer = setTimeout(() => {
          this.alarmTimer = null;
          if (!this.enabled || !this.context.readyRef.current) return;
          const currentSignature = getAlarmScheduleSignature(this.context.dataRef.current);
          if (
            this.context.lastAlarmSyncSignatureRef.current === currentSignature &&
            this.context.failedAlarmSyncSignatureRef.current !== currentSignature
          )
            return;
          void this.operations.resyncAlarms();
        }, 500);
      }
    }
  }

  private clearAutomaticTimer(): void {
    const timer = this.context.automaticSaveTimerRef.current;
    if (timer !== null) clearTimeout(timer);
    this.context.automaticSaveTimerRef.current = null;
  }

  private flush(): void {
    this.clearAutomaticTimer();
    if (
      shouldFlushAutomaticSave(
        getAutomaticSaveContentSignature(this.context.dataRef.current),
        this.context.lastPersistedAutomaticSaveSignatureRef.current,
      )
    )
      void this.operations.flushAutomaticSave(this.context.automaticSaveGenerationRef.current);
  }

  private scheduleAutomaticSave(snapshot: AppStoreEngineState): void {
    if (
      shouldSkipAutomaticSaveForAppliedCanonicalSnapshot(
        snapshot.data,
        this.context.automaticSaveAppliedCanonicalSnapshotRef.current,
      )
    ) {
      this.context.automaticSaveAppliedCanonicalSnapshotRef.current = null;
      return;
    }
    this.context.automaticSaveAppliedCanonicalSnapshotRef.current = null;
    this.clearAutomaticTimer();
    if (
      !shouldFlushAutomaticSave(
        getAutomaticSaveContentSignature(snapshot.data),
        this.context.lastPersistedAutomaticSaveSignatureRef.current,
      )
    )
      return;
    if (!this.lifecycle.active) {
      this.flush();
      return;
    }
    const generation = this.context.automaticSaveGenerationRef.current;
    const timer = setTimeout(() => {
      if (this.context.automaticSaveTimerRef.current === timer)
        this.context.automaticSaveTimerRef.current = null;
      if (this.enabled) void this.operations.flushAutomaticSave(generation);
    }, 300);
    this.context.automaticSaveTimerRef.current = timer;
  }
}
