import { getCurrentAppUpdateLabel } from '../../constants/app-release';
import { getAppDistribution } from '../../services/app-distribution';

export type AppManagementPresentation = {
  appUpdateLabel: string;
  playDistribution: boolean;
};

/** Resolves distribution/runtime release metadata outside the route view. */
export function getAppManagementPresentation(): AppManagementPresentation {
  return {
    appUpdateLabel: getCurrentAppUpdateLabel(),
    playDistribution: getAppDistribution() === 'play',
  };
}
