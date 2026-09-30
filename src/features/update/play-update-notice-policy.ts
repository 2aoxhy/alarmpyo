import type { PlayUpdateStatus } from '@/services/play-app-update-policy';
import { formatAppReleaseVersionCode } from '../../utils/app-release-version';

import {
  isPlayUpdatePromptSnoozed,
  type PlayUpdatePromptSnooze,
} from './play-update-snooze-repository';

export type PlayUpdateNoticeKind =
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'failed'
  | 'installed';

export type PlayUpdateStatusBadge = {
  label: '새 버전' | '다운로드 중' | '설치 준비' | '설치 중' | '다시 시도';
  tone: 'info' | 'success' | 'warning' | 'danger';
};

export type PlayUpdateModalPresentation = {
  title: string;
  message: string;
  primaryLabel: '업데이트' | '지금 설치' | '다시 시도' | null;
  primaryHint: string | undefined;
  snoozable: boolean;
};

export type PlayUpdateStatusBarPresentation = {
  actionLabel: '설치' | '다시 시도' | null;
  message: string;
  title: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
};

/** Keeps the known target version when Play Core reports a transient failure
 * without release metadata. This lets retry UI remain actionable. */
export function mergePlayUpdateStatus(
  previous: PlayUpdateStatus | null,
  incoming: PlayUpdateStatus,
): PlayUpdateStatus {
  const incomingFailed =
    incoming.state === 'failed' || incoming.installStatus === 'failed';
  if (
    !incomingFailed ||
    incoming.availableVersionCode > 0 ||
    !previous ||
    previous.availableVersionCode <= 0
  ) {
    return incoming;
  }
  return {
    ...incoming,
    availableVersionCode: previous.availableVersionCode,
    flexibleAllowed: previous.flexibleAllowed,
    updateAvailable: true,
  };
}

export function resolvePlayUpdateNoticeKind(
  status: PlayUpdateStatus | null,
): PlayUpdateNoticeKind | null {
  if (!status?.supported) return null;
  if (status.state === 'installed' || status.installStatus === 'installed') {
    return 'installed';
  }
  if (status.availableVersionCode <= 0) return null;
  if (status.state === 'installing' || status.installStatus === 'installing') {
    return 'installing';
  }
  if (status.state === 'downloaded' || status.installStatus === 'downloaded') {
    return 'downloaded';
  }
  if (
    status.state === 'in-progress' ||
    status.installStatus === 'pending' ||
    status.installStatus === 'downloading'
  ) {
    return 'downloading';
  }
  if (
    status.state === 'failed' ||
    status.state === 'canceled' ||
    status.installStatus === 'failed' ||
    status.installStatus === 'canceled'
  ) {
    return 'failed';
  }
  if (status.updateAvailable || status.state === 'available') return 'available';
  return null;
}

export function shouldPresentPlayUpdateModal(
  status: PlayUpdateStatus | null,
  snooze: PlayUpdatePromptSnooze | null,
  now = Date.now(),
): boolean {
  const kind = resolvePlayUpdateNoticeKind(status);
  // 중앙 알림은 새 버전을 처음 발견했을 때만 사용해요. 다운로드 이후의
  // 상태는 비차단 상태 바로 이어서 보여 줘 모달이 두 번 뜨지 않게 합니다.
  if (!status || kind !== 'available') {
    return false;
  }
  return !isPlayUpdatePromptSnoozed(
    snooze,
    status.availableVersionCode,
    now,
  );
}

export function getPlayUpdateStatusBarPresentation(
  kind: PlayUpdateNoticeKind | null,
  progress: number | null,
): PlayUpdateStatusBarPresentation | null {
  switch (kind) {
    case 'downloading':
      return {
        actionLabel: null,
        message:
          progress === null
            ? 'Google Play에서 준비 중'
            : `${Math.round(progress)}% 완료`,
        title: '업데이트 다운로드 중',
        tone: 'info',
      };
    case 'downloaded':
      return {
        actionLabel: '설치',
        message: '다운로드 완료',
        title: '업데이트 준비 완료',
        tone: 'success',
      };
    case 'installing':
      return {
        actionLabel: null,
        message: 'Google Play에서 처리 중',
        title: '업데이트 설치 중',
        tone: 'warning',
      };
    case 'failed':
      return {
        actionLabel: '다시 시도',
        message: '네트워크 연결 확인',
        title: '업데이트 실패',
        tone: 'danger',
      };
    case 'available':
    case 'installed':
    case null:
      return null;
  }
}

export function shouldPresentPlayUpdateStatusBar(
  status: PlayUpdateStatus | null,
  snooze: PlayUpdatePromptSnooze | null,
  now = Date.now(),
): boolean {
  const kind = resolvePlayUpdateNoticeKind(status);
  if (
    !status ||
    kind === null ||
    kind === 'available' ||
    kind === 'installed'
  ) {
    return false;
  }

  const canceled =
    status.state === 'canceled' || status.installStatus === 'canceled';
  return !(
    canceled &&
    isPlayUpdatePromptSnoozed(snooze, status.availableVersionCode, now)
  );
}

export function getPlayUpdateStatusBadge(
  status: PlayUpdateStatus | null,
): PlayUpdateStatusBadge | null {
  switch (resolvePlayUpdateNoticeKind(status)) {
    case 'available':
      return { label: '새 버전', tone: 'info' };
    case 'downloading':
      return { label: '다운로드 중', tone: 'info' };
    case 'downloaded':
      return { label: '설치 준비', tone: 'success' };
    case 'installing':
      return { label: '설치 중', tone: 'warning' };
    case 'failed':
      return { label: '다시 시도', tone: 'danger' };
    case 'installed':
    case null:
      return null;
  }
}

export function getPlayUpdateTransitionAnnouncement(
  previous: PlayUpdateNoticeKind | null,
  current: PlayUpdateNoticeKind | null,
): string | null {
  if (previous === current || current === null) return null;
  switch (current) {
    case 'available':
      return '새 버전 있음';
    case 'downloading':
      return '다운로드 시작';
    case 'downloaded':
      return '설치 준비 완료';
    case 'installing':
      return '설치 중';
    case 'failed':
      return '업데이트 실패 · 다시 시도 가능';
    case 'installed':
      return '설치 완료';
  }
}

export function getPlayUpdateModalPresentation(
  kind: PlayUpdateNoticeKind | null,
  versionCode: number,
): PlayUpdateModalPresentation {
  const versionLabel = formatAppReleaseVersionCode(versionCode);
  switch (kind) {
    case 'downloaded':
      return {
        title: `${versionLabel} 설치 준비`,
        message: '다운로드 완료 · 저장된 근무표 유지',
        primaryLabel: '지금 설치',
        primaryHint: '다운로드한 업데이트를 설치합니다.',
        snoozable: true,
      };
    case 'installing':
      return {
        title: `${versionLabel} 설치 중`,
        message: 'Google Play에서 처리 중',
        primaryLabel: null,
        primaryHint: undefined,
        snoozable: false,
      };
    case 'failed':
      return {
        title: '업데이트 실패',
        message: '인터넷 연결과 Google Play 상태 확인',
        primaryLabel: '다시 시도',
        primaryHint: 'Google Play 업데이트를 다시 시도합니다.',
        snoozable: true,
      };
    case 'available':
    case 'downloading':
    case 'installed':
    case null:
      return {
        title: `새 버전 ${versionLabel}`,
        message: 'Google Play에서 업데이트',
        primaryLabel: '업데이트',
        primaryHint: 'Google Play에서 업데이트를 시작합니다.',
        snoozable: true,
      };
  }
}
