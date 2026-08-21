import type { PlayUpdateStatus } from '@/services/play-app-update-policy';

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
  if (!status || kind === null || kind === 'downloading' || kind === 'installed') {
    return false;
  }
  if (kind === 'installing') return true;
  return !isPlayUpdatePromptSnoozed(
    snooze,
    status.availableVersionCode,
    now,
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
      return '새 앱 버전을 사용할 수 있습니다.';
    case 'downloading':
      return '업데이트 다운로드를 시작했습니다.';
    case 'downloaded':
      return '업데이트 설치 준비를 마쳤습니다.';
    case 'installing':
      return '업데이트를 설치하고 있습니다.';
    case 'failed':
      return '업데이트를 완료하지 못했습니다. 다시 시도할 수 있습니다.';
    case 'installed':
      return '업데이트를 설치했습니다.';
  }
}

export function getPlayUpdateModalPresentation(
  kind: PlayUpdateNoticeKind | null,
  versionCode: number,
): PlayUpdateModalPresentation {
  const versionLabel = versionCode > 0 ? `V${versionCode}` : '새 버전';
  switch (kind) {
    case 'downloaded':
      return {
        title: `${versionLabel} 설치 준비 완료`,
        message: '다운로드를 마쳤습니다. 저장된 근무표를 유지한 채 설치합니다.',
        primaryLabel: '지금 설치',
        primaryHint: '다운로드한 업데이트를 설치합니다.',
        snoozable: true,
      };
    case 'installing':
      return {
        title: `${versionLabel} 설치 중`,
        message: 'Google Play가 업데이트를 안전하게 설치하고 있습니다.',
        primaryLabel: null,
        primaryHint: undefined,
        snoozable: false,
      };
    case 'failed':
      return {
        title: '업데이트를 완료하지 못했습니다',
        message:
          '인터넷 연결과 Google Play 상태를 확인한 뒤 다시 시도할 수 있습니다.',
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
        message:
          'Google Play에서 새 기능과 개선 사항을 안전하게 설치할 수 있습니다.',
        primaryLabel: '업데이트',
        primaryHint: 'Google Play에서 업데이트를 시작합니다.',
        snoozable: true,
      };
  }
}
