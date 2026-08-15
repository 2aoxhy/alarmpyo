import type { AlarmPyoAlarmStatus } from './alarmpyo-alarm-service';
import type { SleepReminderStatus } from './sleep-reminder-service';

export type AppLifecycleRuntimeSnapshot = {
  alarmStatus: AlarmPyoAlarmStatus | null;
  alarmStatusError: boolean;
  sleepReminderStatus: SleepReminderStatus | null;
  sleepReminderStatusError: boolean;
  loading: boolean;
  revision: number;
};

export type AppLifecycleRefreshOptions = {
  transitionId: number;
  includeSleepReminder: boolean;
  revisionKey?: string;
  force?: boolean;
};

type RuntimeReader<T> = () => Promise<T>;

type RequestSlot<T> = {
  completedRequestKey: string | null;
  pendingRequestKey: string | null;
  pending: Promise<T> | null;
  pendingGeneration: number;
  latestGeneration: number;
};

type RequestHandle<T> = {
  generation: number;
  owned: boolean;
  promise: Promise<T>;
};

function createRequestSlot<T>(): RequestSlot<T> {
  return {
    completedRequestKey: null,
    pendingRequestKey: null,
    pending: null,
    pendingGeneration: 0,
    latestGeneration: 0,
  };
}

export function createAppLifecycleCoordinator({
  readAlarmStatus,
  readSleepReminderStatus,
}: {
  readAlarmStatus: RuntimeReader<AlarmPyoAlarmStatus>;
  readSleepReminderStatus: RuntimeReader<SleepReminderStatus>;
}) {
  const listeners = new Set<() => void>();
  const alarmSlot = createRequestSlot<AlarmPyoAlarmStatus>();
  const sleepSlot = createRequestSlot<SleepReminderStatus>();
  let snapshot: AppLifecycleRuntimeSnapshot = {
    alarmStatus: null,
    alarmStatusError: false,
    sleepReminderStatus: null,
    sleepReminderStatusError: false,
    loading: false,
    revision: 0,
  };

  const publish = (patch: Partial<AppLifecycleRuntimeSnapshot>) => {
    snapshot = { ...snapshot, ...patch, revision: snapshot.revision + 1 };
    listeners.forEach((listener) => listener());
  };

  const publishLoadingIfChanged = () => {
    const loading = alarmSlot.pending !== null || sleepSlot.pending !== null;
    if (snapshot.loading !== loading) publish({ loading });
  };

  const readOnce = <T>(
    slot: RequestSlot<T>,
    requestKey: string,
    reader: RuntimeReader<T>,
    force: boolean,
  ): RequestHandle<T> | null => {
    if (!force && slot.completedRequestKey === requestKey) return null;
    if (slot.pending && slot.pendingRequestKey === requestKey) {
      return {
        generation: slot.pendingGeneration,
        owned: false,
        promise: slot.pending,
      };
    }
    const generation = slot.latestGeneration + 1;
    slot.latestGeneration = generation;
    const request = reader().finally(() => {
      if (slot.pending === request) {
        slot.pending = null;
        slot.pendingRequestKey = null;
        slot.pendingGeneration = 0;
      }
    });
    slot.pending = request;
    slot.pendingRequestKey = requestKey;
    slot.pendingGeneration = generation;
    return { generation, owned: true, promise: request };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invalidate() {
      alarmSlot.completedRequestKey = null;
      sleepSlot.completedRequestKey = null;
    },
    async refresh({
      transitionId,
      includeSleepReminder,
      revisionKey = '',
      force = false,
    }: AppLifecycleRefreshOptions): Promise<AppLifecycleRuntimeSnapshot> {
      const requestKey = `${transitionId}:${revisionKey}`;
      const alarmRequest = readOnce(
        alarmSlot,
        requestKey,
        readAlarmStatus,
        force,
      );
      const sleepRequest = includeSleepReminder
        ? readOnce(
            sleepSlot,
            requestKey,
            readSleepReminderStatus,
            force,
          )
        : null;
      if (!alarmRequest && !sleepRequest) return snapshot;

      publishLoadingIfChanged();
      const [alarmResult, sleepResult] = await Promise.all([
        alarmRequest
          ? alarmRequest.promise.then(
              (value) => ({ ok: true as const, value }),
              () => ({ ok: false as const }),
            )
          : null,
        sleepRequest
          ? sleepRequest.promise.then(
              (value) => ({ ok: true as const, value }),
              () => ({ ok: false as const }),
            )
          : null,
      ]);

      const patch: Partial<AppLifecycleRuntimeSnapshot> = {
        loading: alarmSlot.pending !== null || sleepSlot.pending !== null,
      };
      if (
        alarmResult &&
        alarmRequest?.owned &&
        alarmRequest.generation === alarmSlot.latestGeneration
      ) {
        alarmSlot.completedRequestKey = requestKey;
        patch.alarmStatus = alarmResult.ok ? alarmResult.value : null;
        patch.alarmStatusError = !alarmResult.ok;
      }
      if (
        sleepResult &&
        sleepRequest?.owned &&
        sleepRequest.generation === sleepSlot.latestGeneration
      ) {
        sleepSlot.completedRequestKey = requestKey;
        patch.sleepReminderStatus = sleepResult.ok ? sleepResult.value : null;
        patch.sleepReminderStatusError = !sleepResult.ok;
      } else if (!includeSleepReminder && !sleepSlot.pending) {
        patch.sleepReminderStatus = null;
        patch.sleepReminderStatusError = false;
      }
      const hasStatusPatch = Object.keys(patch).length > 1;
      if (hasStatusPatch || snapshot.loading !== patch.loading) publish(patch);
      return snapshot;
    },
  };
}

export type AppLifecycleCoordinator = ReturnType<
  typeof createAppLifecycleCoordinator
>;
