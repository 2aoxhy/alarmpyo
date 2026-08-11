import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type AppStateSubscription = ReturnType<typeof AppState.addEventListener>;

const listeners = new Set<() => void>();
let appStateSubscription: AppStateSubscription | null = null;
let appActive = isActiveState(AppState.currentState);

function isActiveState(state: AppStateStatus | null) {
  return state !== 'background' && state !== 'inactive';
}

function updateAppState(state: AppStateStatus) {
  const nextAppActive = isActiveState(state);
  if (nextAppActive === appActive) return;

  appActive = nextAppActive;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', updateAppState);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      appStateSubscription?.remove();
      appStateSubscription = null;
      appActive = isActiveState(AppState.currentState);
    }
  };
}

function getSnapshot() {
  return appActive;
}

export function useAppActive() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
