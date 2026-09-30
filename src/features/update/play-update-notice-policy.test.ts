import { describe, expect, it } from 'vitest';

import type { PlayUpdateStatus } from '@/services/play-app-update-policy';

import {
  getPlayUpdateStatusBadge,
  getPlayUpdateStatusBarPresentation,
  getPlayUpdateModalPresentation,
  getPlayUpdateTransitionAnnouncement,
  mergePlayUpdateStatus,
  resolvePlayUpdateNoticeKind,
  shouldPresentPlayUpdateModal,
  shouldPresentPlayUpdateStatusBar,
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

  it('가용 상태 이후에는 중앙 모달을 다시 열지 않습니다', () => {
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
    expect(shouldPresentPlayUpdateModal(installing, snooze, 1_000)).toBe(false);
    expect(shouldPresentPlayUpdateModal(downloaded, null, 1_000)).toBe(false);
    expect(shouldPresentPlayUpdateModal(failed, null, 1_000)).toBe(false);
    expect(shouldPresentPlayUpdateModal(installing, null, 1_000)).toBe(false);
  });

  it('다운로드와 설치 상태는 중앙 모달 대신 비차단 상태 표시를 사용합니다', () => {
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
    expect(shouldPresentPlayUpdateModal(installing, null)).toBe(false);
    expect(getPlayUpdateStatusBarPresentation('downloading', 42.4)).toEqual({
      actionLabel: null,
      message: '42% 완료',
      title: '업데이트 다운로드 중',
      tone: 'info',
    });
    expect(getPlayUpdateStatusBarPresentation('installing', null)).toEqual({
      actionLabel: null,
      message: 'Google Play에서 처리 중',
      title: '업데이트 설치 중',
      tone: 'warning',
    });
  });

  it('설치 준비와 실패 상태 바에 필요한 행동만 제공합니다', () => {
    expect(getPlayUpdateStatusBarPresentation('downloaded', null)).toEqual({
      actionLabel: '설치',
      message: '다운로드 완료',
      title: '업데이트 준비 완료',
      tone: 'success',
    });
    expect(getPlayUpdateStatusBarPresentation('failed', null)).toEqual({
      actionLabel: '다시 시도',
      message: '네트워크 연결 확인',
      title: '업데이트 실패',
      tone: 'danger',
    });
    expect(getPlayUpdateStatusBarPresentation('available', null)).toBeNull();
    expect(getPlayUpdateStatusBarPresentation('installed', null)).toBeNull();
  });

  it('Play 취소 직후에는 24시간 동안 재시도 상태 바를 다시 띄우지 않습니다', () => {
    const canceled = {
      ...BASE_STATUS,
      installStatus: 'canceled' as const,
      state: 'canceled' as const,
    };
    const snooze = { versionCode: 15, snoozedUntil: 86_401_000 };

    expect(shouldPresentPlayUpdateStatusBar(canceled, snooze, 1_000)).toBe(
      false,
    );
    expect(shouldPresentPlayUpdateStatusBar(canceled, snooze, 86_401_001)).toBe(
      true,
    );
    expect(
      shouldPresentPlayUpdateStatusBar(
        { ...canceled, availableVersionCode: 16 },
        snooze,
        1_000,
      ),
    ).toBe(true);
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
      '다운로드 시작',
    );
    expect(
      getPlayUpdateTransitionAnnouncement('downloading', 'downloading'),
    ).toBeNull();
    expect(getPlayUpdateTransitionAnnouncement('installing', 'installed')).toBe(
      '설치 완료',
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
      title: 'V15 설치 준비',
    });
    expect(getPlayUpdateModalPresentation('failed', 15)).toMatchObject({
      primaryLabel: '다시 시도',
      snoozable: true,
      title: '업데이트 실패',
    });
  });

  it('제목과 설명을 겹치지 않고 짧게 표시합니다', () => {
    expect(getPlayUpdateModalPresentation('downloaded', 15)).toMatchObject({
      message: '다운로드 완료 · 저장된 근무표 유지',
      title: 'V15 설치 준비',
    });
    expect(getPlayUpdateModalPresentation('installing', 15)).toMatchObject({
      message: 'Google Play에서 처리 중',
      title: 'V15 설치 중',
    });
  });

  it('V1.21부터 업데이트 제목에 새 버전 형식을 사용합니다', () => {
    expect(getPlayUpdateModalPresentation('available', 20).title).toBe(
      '새 버전 V20',
    );
    expect(getPlayUpdateModalPresentation('available', 21).title).toBe(
      '새 버전 V1.21',
    );
    expect(getPlayUpdateModalPresentation('downloaded', 21).title).toBe(
      'V1.21 설치 준비',
    );
  });
});
