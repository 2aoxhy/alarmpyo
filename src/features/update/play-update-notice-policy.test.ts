import { describe, expect, it } from 'vitest';

import type { PlayUpdateStatus } from '@/services/play-app-update-policy';

import {
  getPlayUpdateStatusBadge,
  getPlayUpdateModalPresentation,
  getPlayUpdateTransitionAnnouncement,
  mergePlayUpdateStatus,
  resolvePlayUpdateNoticeKind,
  shouldPresentPlayUpdateModal,
} from './play-update-notice-policy';

const BASE_STATUS: PlayUpdateStatus = {
  availableVersionCode: 15,
  bytesDownloaded: 0,
  errorCode: 0,
  flexibleAllowed: true,
  installStatus: 'unknown',
  state: 'available',
  supported: true,
  totalBytesToDownload: 100,
  updateAvailable: true,
};

describe('전역 Play 업데이트 안내 정책', () => {
  it('24시간 미루기는 같은 버전의 중앙 안내만 숨기고 상태 배지는 유지합니다', () => {
    const snooze = { versionCode: 15, snoozedUntil: 86_401_000 };
    expect(shouldPresentPlayUpdateModal(BASE_STATUS, snooze, 1_000)).toBe(false);
    expect(getPlayUpdateStatusBadge(BASE_STATUS)?.label).toBe('새 버전');
  });

  it('더 높은 버전은 이전 버전 미루기를 즉시 무효화합니다', () => {
    const snooze = { versionCode: 14, snoozedUntil: 86_401_000 };
    expect(shouldPresentPlayUpdateModal(BASE_STATUS, snooze, 1_000)).toBe(true);
  });

  it('설치 준비와 실패도 24시간 미룰 수 있지만 설치 중은 닫지 않습니다', () => {
    const snooze = { versionCode: 15, snoozedUntil: 86_401_000 };
    const downloaded = {
      ...BASE_STATUS,
      installStatus: 'downloaded' as const,
      state: 'downloaded' as const,
    };
    const failed = {
      ...BASE_STATUS,
      installStatus: 'failed' as const,
      state: 'failed' as const,
    };
    const installing = {
      ...BASE_STATUS,
      installStatus: 'installing' as const,
      state: 'installing' as const,
    };
    expect(shouldPresentPlayUpdateModal(downloaded, snooze, 1_000)).toBe(false);
    expect(shouldPresentPlayUpdateModal(failed, snooze, 1_000)).toBe(false);
    expect(shouldPresentPlayUpdateModal(installing, snooze, 1_000)).toBe(true);
  });

  it('다운로드 중에는 작은 진행 표시만 사용하고 설치 중에는 중앙 모달을 유지합니다', () => {
    const downloading = {
      ...BASE_STATUS,
      installStatus: 'downloading' as const,
      state: 'in-progress' as const,
    };
    const installing = {
      ...BASE_STATUS,
      installStatus: 'installing' as const,
      state: 'installing' as const,
    };
    expect(resolvePlayUpdateNoticeKind(downloading)).toBe('downloading');
    expect(shouldPresentPlayUpdateModal(downloading, null)).toBe(false);
    expect(resolvePlayUpdateNoticeKind(installing)).toBe('installing');
    expect(shouldPresentPlayUpdateModal(installing, null)).toBe(true);
    expect(getPlayUpdateModalPresentation('installing', 15)).toMatchObject({
      primaryLabel: null,
      snoozable: false,
      title: 'V15 설치 중',
    });
  });

  it('설치 완료 상태는 안내와 배지를 정리합니다', () => {
    const installed = {
      ...BASE_STATUS,
      availableVersionCode: 0,
      installStatus: 'installed' as const,
      state: 'installed' as const,
    };
    expect(shouldPresentPlayUpdateModal(installed, null)).toBe(false);
    expect(getPlayUpdateStatusBadge(installed)).toBeNull();
  });

  it('Play Core 실패 응답이 버전을 생략해도 재시도 대상 버전을 보존합니다', () => {
    const failedWithoutVersion = {
      ...BASE_STATUS,
      availableVersionCode: 0,
      flexibleAllowed: false,
      installStatus: 'failed' as const,
      state: 'failed' as const,
      updateAvailable: false,
    };
    const merged = mergePlayUpdateStatus(BASE_STATUS, failedWithoutVersion);
    expect(merged.availableVersionCode).toBe(15);
    expect(merged.flexibleAllowed).toBe(true);
    expect(resolvePlayUpdateNoticeKind(merged)).toBe('failed');
  });

  it('진행률 변화가 아니라 의미 있는 상태 전환만 한 번 안내합니다', () => {
    expect(getPlayUpdateTransitionAnnouncement(null, 'downloading')).toBe(
      '업데이트 다운로드를 시작했습니다.',
    );
    expect(
      getPlayUpdateTransitionAnnouncement('downloading', 'downloading'),
    ).toBeNull();
    expect(getPlayUpdateTransitionAnnouncement('installing', 'installed')).toBe(
      '업데이트를 설치했습니다.',
    );
  });

  it('가용·설치 준비·실패 안내의 행동 문구를 고정합니다', () => {
    expect(getPlayUpdateModalPresentation('available', 15)).toMatchObject({
      primaryLabel: '업데이트',
      snoozable: true,
      title: '새 버전 V15',
    });
    expect(getPlayUpdateModalPresentation('downloaded', 15)).toMatchObject({
      primaryLabel: '지금 설치',
      snoozable: true,
      title: 'V15 설치 준비 완료',
    });
    expect(getPlayUpdateModalPresentation('failed', 15)).toMatchObject({
      primaryLabel: '다시 시도',
      snoozable: true,
    });
  });
});
