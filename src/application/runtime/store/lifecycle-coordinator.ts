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
  private alarmSyncPending = false;
  private lifecycleRevision = 0;

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
    this.lifecycleRevision += 1;
    this.previouslyReady = false;
    this.previousData = null;
    this.previousAlarmSignature = null;
    this.alarmSyncPending = false;
    this.clearAutomaticTimer();
    this.clearAlarmTimer();
  }

  update(next: AppStoreLifecycle): void {
    const resumed = next.active && (
      !this.lifecycle.active || next.transitionId > this.lifecycle.transitionId
    );
    const backgrounded = !next.active && this.lifecycle.active;
    this.lifecycle = next;
    if (resumed || backgrounded) this.lifecycleRevision += 1;
    if (backgrounded) this.clearAlarmTimer();
    if (!this.enabled || !this.context.readyRef.current) return;
    if (backgrounded) this.flush();
    if (resumed) {
      this.scheduleSleepReconciliation();
      this.schedulePendingAlarmSync();
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
      this.scheduleSleepReconciliation();
    }
    if (becameReady || dataChanged) {
      this.scheduleAutomaticSave(snapshot);
      const signature = getAlarmScheduleSignature(snapshot.data);
      if (signature !== this.previousAlarmSignature || becameReady) {
        this.previousAlarmSignature = signature;
        this.alarmSyncPending = true;
        this.schedulePendingAlarmSync();
      }
    }
  }

  private scheduleSleepReconciliation(): void {
    if (!this.enabled || !this.lifecycle.active || !this.context.readyRef.current) return;
    const revision = this.lifecycleRevision;
    void this.context.mutationCoordinator.run(async () => {
      // A foreground refresh may still be waiting behind a durable save when
      // the app backgrounds or restarts. Do not run that stale automatic work.
      if (
        !this.enabled || !this.lifecycle.active || !this.context.readyRef.current ||
        revision !== this.lifecycleRevision
      ) return false;
      return this.operations.syncSleepRemindersForSnapshot(this.context.dataRef.current);
    });
  }

  private clearAlarmTimer(): void {
    if (this.alarmTimer !== null) clearTimeout(this.alarmTimer);
    this.alarmTimer = null;
  }

  private schedulePendingAlarmSync(): void {
    this.clearAlarmTimer();
    if (
      !this.alarmSyncPending || !this.enabled ||
      !this.lifecycle.active || !this.context.readyRef.current
    ) return;
    this.alarmTimer = setTimeout(() => {
      this.alarmTimer = null;
      if (!this.enabled || !this.lifecycle.active || !this.context.readyRef.current) return;
      this.alarmSyncPending = false;
      const currentSignature = getAlarmScheduleSignature(this.context.dataRef.current);
      if (
        this.context.lastAlarmSyncSignatureRef.current === currentSignature &&
        this.context.failedAlarmSyncSignatureRef.current !== currentSignature
      ) return;
      // Only the delayed automatic check is deferred. Explicit save/OFF/retry
      // commands and native alarms already registered with Android stay intact.
      void this.operations.resyncAlarms();
    }, 500);
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
