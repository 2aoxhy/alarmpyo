import { getCurrentAppUpdateLabel } from '../../constants/app-release';
import { useGlobalPlayUpdate } from './global-play-update-controller';

export type PlayAppUpdateDialogPresenter = (
  title: string,
  message: string,
) => void;

/** Owns Play distribution/native update orchestration for the update screen. */
export function usePlayAppUpdateController(
  _showDialog: PlayAppUpdateDialogPresenter,
) {
  const { busy, performPrimaryAction, status } = useGlobalPlayUpdate();

  return {
    appUpdateLabel: getCurrentAppUpdateLabel(),
    busy,
    openPlayUpdate: performPrimaryAction,
    status,
  };
}

export type { PlayUpdateStatus } from '../../services/play-app-update-service';
