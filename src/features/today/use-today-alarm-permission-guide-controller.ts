import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppLifecycle } from '../../hooks/use-app-active';
import type { useAlarmRuntimeStatus } from '../../hooks/use-alarm-runtime-status';
import {
  openAlarmPyoPermissionSettings,
  type AlarmPyoPermissionSettingsTarget,
} from '../../services/alarmpyo-alarm-service';

import { resolveTodayAlarmPermissionGuide } from './today-alarm-permission-guide-model';
import {
  createSingleFlightTokenGate,
  type SingleFlightTokenGate,
} from './single-flight-token-gate';

type AlarmRuntimeStatusController = ReturnType<typeof useAlarmRuntimeStatus>;

export function useTodayAlarmPermissionGuideController({
  alarmEnabled,
  enabled,
  platformSupported,
  runtimeStatus,
}: {
  alarmEnabled: boolean;
  enabled: boolean;
  platformSupported: boolean;
  runtimeStatus: AlarmRuntimeStatusController;
}) {
  const lifecycle = useAppLifecycle();
  const pendingReturnRef = useRef<{
    target: AlarmPyoPermissionSettingsTarget;
    transitionId: number;
  } | null>(null);
  const permissionLaunchGateRef = useRef<SingleFlightTokenGate | null>(null);
  if (permissionLaunchGateRef.current == null) {
    permissionLaunchGateRef.current = createSingleFlightTokenGate();
  }
  const [busy, setBusy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [completionRevision, setCompletionRevision] = useState(0);
  const viewModel = resolveTodayAlarmPermissionGuide({
    alarmEnabled,
    platformSupported,
    status: runtimeStatus.alarmStatus,
  });

  useEffect(() => {
    const pending = pendingReturnRef.current;
    if (
      !enabled ||
      !lifecycle.active ||
      !pending ||
      lifecycle.transitionId <= pending.transitionId
    ) {
      return;
    }

    // useAlarmRuntimeStatus의 자동 복귀 조회와 같은 transition key를 사용합니다.
    // 두 호출은 lifecycle coordinator에서 하나의 네이티브 읽기로 합쳐집니다.
    pendingReturnRef.current = null;
    void runtimeStatus.refresh().then((snapshot) => {
      const next = resolveTodayAlarmPermissionGuide({
        alarmEnabled,
        platformSupported,
        status: snapshot.alarmStatus,
      });
      if (
        snapshot.alarmStatus?.supported &&
        !snapshot.alarmStatusError &&
        !next
      ) {
        setCompletionRevision((current) => current + 1);
      }
    });
  }, [
    alarmEnabled,
    enabled,
    lifecycle.active,
    lifecycle.transitionId,
    platformSupported,
    runtimeStatus,
  ]);

  const openNextPermission = useCallback(async () => {
    if (!viewModel) return;
    const launchToken = permissionLaunchGateRef.current?.claim();
    if (launchToken == null) return;
    setBusy(true);
    setLaunchError(null);
    pendingReturnRef.current = {
      target: viewModel.target,
      transitionId: lifecycle.transitionId,
    };
    try {
      const result = await openAlarmPyoPermissionSettings(viewModel.target);
      if (!result.opened) throw new Error('permission-settings-unavailable');
    } catch {
      pendingReturnRef.current = null;
      setLaunchError('휴대폰 설정을 열지 못했습니다. 알람 설정에서 다시 시도합니다.');
    } finally {
      if (permissionLaunchGateRef.current?.release(launchToken)) {
        setBusy(false);
      }
    }
  }, [lifecycle.transitionId, viewModel]);

  return {
    busy,
    completionRevision,
    launchError,
    openNextPermission,
    viewModel,
  };
}
