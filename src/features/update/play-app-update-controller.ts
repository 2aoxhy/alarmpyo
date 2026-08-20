import { useCallback, useEffect, useState } from 'react';

import { getCurrentAppUpdateLabel } from '../../constants/app-release';
import { useAppLifecycle } from '../../hooks/use-app-active';
import { useScreenActive } from '../../hooks/use-screen-active';
import { openGooglePlayListing } from '../../services/app-distribution';
import {
  completeFlexiblePlayUpdate,
  getPlayUpdateStatusForTransition,
  startFlexiblePlayUpdate,
  type PlayUpdateStatus,
} from '../../services/play-app-update-service';

export type PlayAppUpdateDialogPresenter = (
  title: string,
  message: string,
) => void;

/** Owns Play distribution/native update orchestration for the update screen. */
export function usePlayAppUpdateController(
  showDialog: PlayAppUpdateDialogPresenter,
) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<PlayUpdateStatus | null>(null);
  const screenActive = useScreenActive();
  const appLifecycle = useAppLifecycle();

  useEffect(() => {
    if (!screenActive) return;
    let cancelled = false;
    void getPlayUpdateStatusForTransition(appLifecycle.transitionId).then(
      (nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [appLifecycle.transitionId, screenActive]);

  const openPlayUpdate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (
        status?.state === 'downloaded' ||
        status?.installStatus === 'downloaded'
      ) {
        setStatus(await completeFlexiblePlayUpdate());
      } else if (
        status?.supported &&
        status.updateAvailable &&
        status.flexibleAllowed
      ) {
        setStatus(await startFlexiblePlayUpdate());
      } else {
        await openGooglePlayListing();
      }
    } catch {
      showDialog(
        'Google Play를 열지 못했습니다',
        '인터넷 연결과 Google Play 사용 가능 여부를 확인한 뒤 다시 시도해야 합니다.',
      );
    } finally {
      setBusy(false);
    }
  }, [busy, showDialog, status]);

  return {
    appUpdateLabel: getCurrentAppUpdateLabel(),
    busy,
    openPlayUpdate,
    status,
  };
}

export type { PlayUpdateStatus };
