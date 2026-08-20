import { Platform } from 'react-native';

import { getAlarmPyoNativeModule } from '@/infrastructure/alarmpyo-native-module';
import { getAppDistribution } from '@/services/app-distribution';
import {
  normalizePlayUpdateStatus,
  normalizeStartedPlayUpdateStatus,
  UNSUPPORTED_PLAY_UPDATE_STATUS,
  type PlayUpdateStatus,
} from '@/services/play-app-update-policy';

export {
  canDismissPlayUpdate,
  getPlayUpdateProgress,
  normalizePlayUpdateStatus,
  normalizeStartedPlayUpdateStatus,
  shouldPollPlayUpdate,
  shouldShowPlayUpdate,
} from '@/services/play-app-update-policy';
export type {
  PlayUpdateInstallStatus,
  PlayUpdateState,
  PlayUpdateStatus,
} from '@/services/play-app-update-policy';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canUsePlayUpdateApi(): boolean {
  const native = getAlarmPyoNativeModule();
  return (
    Platform.OS === 'android' &&
    getAppDistribution() === 'play' &&
    Boolean(native?.getPlayUpdateStatusAsync)
  );
}

let completedTransitionId: number | null = null;
let cachedStatus: PlayUpdateStatus = { ...UNSUPPORTED_PLAY_UPDATE_STATUS };
let pendingTransitionId: number | null = null;
let pendingStatus: Promise<PlayUpdateStatus> | null = null;

export async function getPlayUpdateStatusForTransition(
  transitionId: number,
  force = false,
): Promise<PlayUpdateStatus> {
  if (!canUsePlayUpdateApi()) return { ...UNSUPPORTED_PLAY_UPDATE_STATUS };
  if (!force && completedTransitionId === transitionId) return cachedStatus;
  if (!force && pendingStatus && pendingTransitionId === transitionId) {
    return pendingStatus;
  }

  const native = getAlarmPyoNativeModule()!;
  const request = native.getPlayUpdateStatusAsync!()
    .then(normalizePlayUpdateStatus)
    .catch(() => ({ ...UNSUPPORTED_PLAY_UPDATE_STATUS }))
    .then((status) => {
      cachedStatus = status;
      completedTransitionId = transitionId;
      return status;
    })
    .finally(() => {
      if (pendingStatus === request) {
        pendingStatus = null;
        pendingTransitionId = null;
      }
    });
  pendingStatus = request;
  pendingTransitionId = transitionId;
  return request;
}

export async function startFlexiblePlayUpdate(): Promise<PlayUpdateStatus> {
  const native = getAlarmPyoNativeModule();
  if (!canUsePlayUpdateApi() || !native?.startPlayUpdateAsync) {
    return { ...UNSUPPORTED_PLAY_UPDATE_STATUS };
  }
  try {
    const result = await native.startPlayUpdateAsync();
    cachedStatus = normalizeStartedPlayUpdateStatus(result);
    return cachedStatus;
  } catch {
    return { ...cachedStatus, state: 'failed' };
  }
}

export async function completeFlexiblePlayUpdate(): Promise<PlayUpdateStatus> {
  const native = getAlarmPyoNativeModule();
  if (!canUsePlayUpdateApi() || !native?.completePlayUpdateAsync) {
    return { ...UNSUPPORTED_PLAY_UPDATE_STATUS };
  }
  try {
    const result = await native.completePlayUpdateAsync();
    const status = isRecord(result) ? result.status : null;
    cachedStatus = normalizePlayUpdateStatus(status);
    return cachedStatus;
  } catch {
    return { ...cachedStatus, state: 'failed' };
  }
}
