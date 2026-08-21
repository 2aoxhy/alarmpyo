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
    ? 'Google Play에서 최신 버전을 확인합니다'
    : '새 앱 설치 파일을 확인하고 안전하게 설치합니다';
  return {
    appUpdateLabel: getCurrentAppUpdateLabel(),
    appUpdateSubtitle:
      playDistribution && updateBadge
        ? `${baseUpdateSubtitle} · ${updateBadge.label}`
        : baseUpdateSubtitle,
    playDistribution,
  };
}
