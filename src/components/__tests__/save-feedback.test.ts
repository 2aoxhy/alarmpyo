import { describe, expect, it } from 'vitest';

import { createSaveIssueOutcome } from '../../application/save-outcome';
import {
  getSaveOutcomePresentation,
  shouldExpandSaveErrorBanner,
} from '../save-feedback';

describe('저장 상태 안내 문구', () => {
  it('좁은 화면이나 큰 글자에서는 오류 배너를 축소 상태로 시작해요', () => {
    expect(shouldExpandSaveErrorBanner(320, 1)).toBe(false);
    expect(shouldExpandSaveErrorBanner(412, 1.4)).toBe(false);
    expect(shouldExpandSaveErrorBanner(412, 1)).toBe(true);
  });

  it('알람 동기화 오류는 원인 코드로 부분 성공을 안내해요', () => {
    expect(
      getSaveOutcomePresentation(
        createSaveIssueOutcome(
          'alarm-sync-failed',
          '자료는 저장됐지만 알람을 다시 예약하지 못했어요.',
        ),
      ),
    ).toEqual({
      kind: 'partial',
      title: '자료 저장 완료',
      message: '자료는 저장됐지만 알람을 다시 예약하지 못했어요.',
    });
  });

  it('수면 알림 실패를 전체 저장 실패로 오인하지 않아요', () => {
    const outcome = createSaveIssueOutcome(
      'sleep-reminder-sync-failed',
      '자료는 저장했지만 수면 알림을 갱신하지 못했어요.',
    );

    expect(outcome).toMatchObject({
      status: 'partial',
      retryAction: 'retry-sleep-reminders',
    });
    expect(getSaveOutcomePresentation(outcome)).toEqual({
      kind: 'partial',
      title: '자료 저장 완료',
      message: '자료는 저장했지만 수면 알림을 갱신하지 못했어요.',
    });
  });

  it('안전 백업과 기기 백업은 저장 완료 범위를 유지해요', () => {
    for (const issueCode of [
      'safety-backup-failed',
      'device-backup-failed',
    ] as const) {
      const outcome = createSaveIssueOutcome(
        issueCode,
        '근무표는 저장됐지만 안전 백업을 만들지 못했어요.',
      );
      expect(outcome.status).toBe('partial');
      expect(getSaveOutcomePresentation(outcome).title).toBe('자료 저장 완료');
    }
  });

  it('본문 저장 실패는 전체 실패와 저장 재시도로 분류해요', () => {
    const outcome = createSaveIssueOutcome(
      'primary-save-failed',
      '변경 내용을 저장하지 못했어요. 저장 공간을 확인해 주세요.',
    );

    expect(outcome).toMatchObject({
      status: 'failure',
      retryAction: 'retry-save',
    });
    expect(getSaveOutcomePresentation(outcome)).toEqual({
      kind: 'error',
      title: '변경 내용을 저장하지 못했어요',
      message: '변경 내용을 저장하지 못했어요. 저장 공간을 확인해 주세요.',
    });
  });
});
