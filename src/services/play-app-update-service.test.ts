import { describe, expect, it } from 'vitest';

import {
  canDismissPlayUpdate,
  getPlayUpdateProgress,
  normalizePlayUpdateStatus,
  normalizeStartedPlayUpdateStatus,
  shouldShowPlayUpdate,
  shouldPollPlayUpdate,
} from './play-app-update-policy';

describe('Google Play 업데이트 서비스', () => {
  it('지원되지 않거나 손상된 응답을 안전한 미지원 상태로 처리합니다', () => {
    expect(normalizePlayUpdateStatus(null).supported).toBe(false);
    expect(normalizePlayUpdateStatus({ supported: false }).state).toBe(
      'unsupported',
    );
  });

  it('업데이트 버전과 다운로드 진행률을 정규화합니다', () => {
    const status = normalizePlayUpdateStatus({
      supported: true,
      state: 'in-progress',
      updateAvailable: true,
      flexibleAllowed: true,
      availableVersionCode: 12,
      installStatus: 'downloading',
      bytesDownloaded: 51,
      totalBytesToDownload: 100,
      errorCode: 0,
    });

    expect(status.availableVersionCode).toBe(12);
    expect(getPlayUpdateProgress(status)).toBe(51);
  });

  it('닫은 버전도 다운로드가 시작됐거나 설치 대기 중이면 다시 표시합니다', () => {
    const available = normalizePlayUpdateStatus({
      supported: true,
      state: 'available',
      updateAvailable: true,
      flexibleAllowed: true,
      availableVersionCode: 12,
      installStatus: 'pending',
    });
    const downloaded = {
      ...available,
      state: 'downloaded' as const,
      installStatus: 'downloaded' as const,
    };
    const installing = {
      ...available,
      state: 'installing' as const,
      installStatus: 'installing' as const,
    };

    expect(shouldShowPlayUpdate(available, 12)).toBe(false);
    expect(shouldShowPlayUpdate(downloaded, 12)).toBe(true);
    expect(shouldShowPlayUpdate(installing, 12)).toBe(true);
    expect(canDismissPlayUpdate(available)).toBe(true);
    expect(canDismissPlayUpdate(downloaded)).toBe(false);
    expect(canDismissPlayUpdate(installing)).toBe(false);
  });

  it('업데이트 시작 직후 available 응답도 AppState 전환 없이 다운로드 완료까지 폴링합니다', () => {
    let current = normalizeStartedPlayUpdateStatus({
      started: true,
      resultCode: -1,
      status: {
        supported: true,
        state: 'available',
        updateAvailable: true,
        flexibleAllowed: true,
        availableVersionCode: 12,
        installStatus: 'pending',
      },
    });
    const sameTransitionResponses = [
      normalizePlayUpdateStatus({
        supported: true,
        state: 'in-progress',
        updateAvailable: true,
        flexibleAllowed: true,
        availableVersionCode: 12,
        installStatus: 'downloading',
        bytesDownloaded: 51,
        totalBytesToDownload: 100,
      }),
      normalizePlayUpdateStatus({
        supported: true,
        state: 'downloaded',
        updateAvailable: true,
        flexibleAllowed: true,
        availableVersionCode: 12,
        installStatus: 'downloaded',
        bytesDownloaded: 100,
        totalBytesToDownload: 100,
      }),
    ];

    expect(current.state).toBe('in-progress');
    let polls = 0;
    while (shouldPollPlayUpdate(current)) {
      current = sameTransitionResponses[polls]!;
      polls += 1;
    }

    expect(polls).toBe(2);
    expect(current.state).toBe('downloaded');
    expect(shouldShowPlayUpdate(current, 12)).toBe(true);
  });
});
