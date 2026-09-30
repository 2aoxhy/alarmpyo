import { getCurrentAppUpdateLabel } from '../../constants/app-release';
import { getAppDistribution } from '../../services/app-distribution';
import type { PlayUpdateStatusBadge } from '../update/play-update-notice-policy';

export type AppManagementPresentation = {
  appUpdateLabel: string;
  appUpdateSubtitle: string;
  playDistribution: boolean;
};

/** Resolves distribution/runtime release metadata outside the route view. */
export function getAppManagementPresentation(
  updateBadge: PlayUpdateStatusBadge | null = null,
): AppManagementPresentation {
  const playDistribution = getAppDistribution() === 'play';
  const baseUpdateSubtitle = playDistribution
    ? 'Google Play에서 새 버전 확인'
    : '설치 파일 확인 및 업데이트';
  return {
    appUpdateLabel: getCurrentAppUpdateLabel(),
    appUpdateSubtitle:
      playDistribution && updateBadge
        ? `${baseUpdateSubtitle} · ${updateBadge.label}`
        : baseUpdateSubtitle,
    playDistribution,
  };
}
