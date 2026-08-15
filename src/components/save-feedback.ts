import type { SaveIssueOutcome } from '@/application/app-store-contract';

export type SaveFeedbackPresentation = {
  title: string;
  message: string;
  kind: 'partial' | 'error';
};

/** 좁은 화면과 큰 글자에서는 오류 안내가 콘텐츠를 덮지 않도록 작게 시작해요. */
export function shouldExpandSaveErrorBanner(
  viewportWidth: number,
  fontScale: number,
): boolean {
  const safeWidth = Number.isFinite(viewportWidth) ? viewportWidth : 320;
  const safeFontScale = Number.isFinite(fontScale) ? fontScale : 1;
  return safeWidth >= 360 && safeFontScale < 1.25;
}

/** 오류 문구를 다시 해석하지 않고 Store가 기록한 원인 코드로 안내를 결정해요. */
export function getSaveOutcomePresentation(
  outcome: SaveIssueOutcome,
): SaveFeedbackPresentation {
  const kind = outcome.status === 'partial' ? 'partial' : 'error';

  // 부분 성공은 본문 자료가 이미 영속 저장된 상태예요. 사용자가 전체 저장
  // 실패로 오해하지 않도록 결과를 먼저 말하고, 아래 문구와 재시도 버튼에서
  // 실패한 후속 작업만 안내해요.
  if (outcome.status === 'partial') {
    return {
      kind,
      title: '자료 저장 완료',
      message: outcome.message,
    };
  }

  switch (outcome.issueCode) {
    case 'alarm-sync-failed':
      return {
        kind,
        title: '알람 예약을 확인해야 합니다',
        message: outcome.message,
      };
    case 'sleep-reminder-sync-failed':
      return {
        kind,
        title: '수면 알림을 확인해야 합니다',
        message: outcome.message,
      };
    case 'safety-backup-failed':
    case 'device-backup-failed':
      return {
        kind,
        title: '안전 백업을 확인해야 합니다',
        message: outcome.message,
      };
    case 'reset-marker-cleanup-failed':
      return {
        kind,
        title: '초기화 상태를 확인해야 합니다',
        message: outcome.message,
      };
    case 'restore-protection-failed':
      return {
        kind,
        title: '복원 전 백업을 확인해야 합니다',
        message: outcome.message,
      };
    case 'invalid-data':
      return {
        kind,
        title: '변경 내용의 형식을 확인해야 합니다',
        message: outcome.message,
      };
    case 'invalid-work-schedule':
      return {
        kind,
        title: '근무 시간과 순서를 확인해야 합니다',
        message: outcome.message,
      };
    case 'primary-save-failed':
      return {
        kind,
        title: '변경 내용을 저장하지 못했습니다',
        message: outcome.message,
      };
    case 'unsafe-alarm-schedule':
      return {
        kind,
        title: '근무 시간과 순서를 확인해야 합니다',
        message: outcome.message,
      };
  }
}
