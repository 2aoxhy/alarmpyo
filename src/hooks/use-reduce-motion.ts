import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

type ReduceMotionSubscription = ReturnType<typeof AccessibilityInfo.addEventListener>;
export type ReduceMotionStatus = { enabled: boolean; known: boolean };

const listeners = new Set<() => void>();
let reduceMotionSubscription: ReduceMotionSubscription | null = null;
let queryRevision = 0;
let statusSnapshot: ReduceMotionStatus = { enabled: false, known: false };
const serverSnapshot: ReduceMotionStatus = { enabled: false, known: false };

function updateReduceMotion(enabled: boolean) {
  if (statusSnapshot.known && statusSnapshot.enabled === enabled) return;

  statusSnapshot = { enabled, known: true };
  listeners.forEach((listener) => listener());
}

function startSharedSubscription() {
  if (reduceMotionSubscription) return;

  const revision = queryRevision + 1;
  queryRevision = revision;
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => {
      if (queryRevision === revision) updateReduceMotion(enabled);
    })
    .catch(() => {
      // 조회에 실패하면 알 수 없는 상태를 유지해 애니메이션을 보수적으로 멈춥니다.
    });
  reduceMotionSubscription = AccessibilityInfo.addEventListener(
    'reduceMotionChanged',
    updateReduceMotion,
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startSharedSubscription();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      queryRevision += 1;
      reduceMotionSubscription?.remove();
      reduceMotionSubscription = null;
    }
  };
}

function getSnapshot() {
  return statusSnapshot;
}

export function useReduceMotionStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}

export function shouldReduceMotion(status: ReduceMotionStatus) {
  return !status.known || status.enabled;
}

export function useReduceMotion() {
  return shouldReduceMotion(useReduceMotionStatus());
}
