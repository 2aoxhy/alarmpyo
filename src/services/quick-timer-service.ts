import { getAlarmPyoNativeModule } from '../infrastructure/alarmpyo-native-module';

export const QUICK_TIMER_DURATIONS = [30, 60] as const;

export type QuickTimerDuration = (typeof QUICK_TIMER_DURATIONS)[number];
export type QuickTimerState =
  | 'idle'
  | 'scheduled'
  | 'ringing'
  | 'expired'
  | 'action-required'
  | 'error';
export type QuickTimerStorageHealth = 'normal' | 'recovered' | 'corrupt';
export type QuickTimerRequiredAction =
  | 'none'
  | 'exact-alarm'
  | 'notifications'
  | 'full-screen';

export type QuickTimerStatus = {
  supported: boolean;
  state: QuickTimerState;
  active: boolean;
  durationMinutes: QuickTimerDuration | null;
  startedAt: number;
  fireAt: number;
  remainingMillis: number;
  isRepeat: boolean;
  storageHealth: QuickTimerStorageHealth;
  requiredAction: QuickTimerRequiredAction;
};

const QUICK_TIMER_STATES = new Set<QuickTimerState>([
  'idle',
  'scheduled',
  'ringing',
  'expired',
  'action-required',
  'error',
]);
const QUICK_TIMER_REQUIRED_ACTIONS = new Set<QuickTimerRequiredAction>([
  'none',
  'exact-alarm',
  'notifications',
  'full-screen',
]);

const UNSUPPORTED_STATUS: Readonly<QuickTimerStatus> = {
  supported: false,
  state: 'idle',
  active: false,
  durationMinutes: null,
  startedAt: 0,
  fireAt: 0,
  remainingMillis: 0,
  isRepeat: false,
  storageHealth: 'normal',
  requiredAction: 'none',
};

function unsupportedStatus(): QuickTimerStatus {
  return { ...UNSUPPORTED_STATUS };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : 0;
}

function isQuickTimerDuration(value: unknown): value is QuickTimerDuration {
  return QUICK_TIMER_DURATIONS.some((duration) => duration === value);
}

export function normalizeQuickTimerStatus(value: unknown): QuickTimerStatus {
  if (!isRecord(value) || value.supported !== true) return unsupportedStatus();

  const state = QUICK_TIMER_STATES.has(value.state as QuickTimerState)
    ? (value.state as QuickTimerState)
    : 'error';
  const durationMinutes = isQuickTimerDuration(value.durationMinutes)
    ? value.durationMinutes
    : null;
  const startedAt = normalizeTimestamp(value.startedAt);
  const fireAt = normalizeTimestamp(value.fireAt);
  const nativeActive = value.active === true;
  const active =
    nativeActive &&
    durationMinutes !== null &&
    startedAt > 0 &&
    fireAt >= startedAt;
  const remainingMillis =
    typeof value.remainingMillis === 'number' &&
    Number.isFinite(value.remainingMillis)
      ? Math.max(0, Math.trunc(value.remainingMillis))
      : active
        ? Math.max(0, fireAt - Date.now())
        : 0;
  const storageHealth: QuickTimerStorageHealth =
    value.storageHealth === 'recovered' || value.storageHealth === 'corrupt'
      ? value.storageHealth
      : 'normal';
  const requiredAction = QUICK_TIMER_REQUIRED_ACTIONS.has(
    value.requiredAction as QuickTimerRequiredAction,
  )
    ? (value.requiredAction as QuickTimerRequiredAction)
    : 'none';

  return {
    supported: true,
    state: nativeActive && !active ? 'error' : state,
    active,
    durationMinutes,
    startedAt,
    fireAt,
    remainingMillis,
    isRepeat: value.isRepeat === true,
    storageHealth,
    requiredAction,
  };
}

const nativeModule = getAlarmPyoNativeModule();
let mutationTail: Promise<void> = Promise.resolve();

function nativeTimerSupported(): boolean {
  return Boolean(
    nativeModule?.getQuickTimerStatusAsync &&
      nativeModule.scheduleQuickTimerAsync &&
      nativeModule.cancelQuickTimerAsync,
  );
}

function enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const task = mutationTail.then(mutation);
  mutationTail = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export async function getQuickTimerStatus(): Promise<QuickTimerStatus> {
  if (!nativeTimerSupported()) return unsupportedStatus();
  return normalizeQuickTimerStatus(
    await nativeModule!.getQuickTimerStatusAsync!(),
  );
}

export async function scheduleQuickTimer(
  durationMinutes: QuickTimerDuration,
): Promise<QuickTimerStatus> {
  if (!isQuickTimerDuration(durationMinutes)) {
    throw new RangeError('빠른 타이머는 30분 또는 60분만 설정할 수 있어요.');
  }
  if (!nativeTimerSupported()) return unsupportedStatus();
  return enqueueMutation(async () =>
    normalizeQuickTimerStatus(
      await nativeModule!.scheduleQuickTimerAsync!(durationMinutes),
    ),
  );
}

export async function cancelQuickTimer(): Promise<QuickTimerStatus> {
  if (!nativeTimerSupported()) return unsupportedStatus();
  return enqueueMutation(async () =>
    normalizeQuickTimerStatus(await nativeModule!.cancelQuickTimerAsync!()),
  );
}
