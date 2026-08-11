import { describe, expect, it } from 'vitest';

import { getBackupRestorePresentation } from '../backup-restore-feedback';

describe('최근 백업 복원 결과 안내', () => {
  it('성공은 복원과 복원 전 백업을 모두 마친 경우에만 안내해요', () => {
    expect(getBackupRestorePresentation({ status: 'success' })).toMatchObject({
      kind: 'success',
      retryPendingBackup: false,
    });
  });

  it('복원 전 백업이 대기 중이면 부분 성공과 전용 재시도를 안내해요', () => {
    expect(
      getBackupRestorePresentation({ status: 'partial', reason: 'backup-pending' }),
    ).toMatchObject({
      kind: 'partial',
      retryPendingBackup: true,
    });
  });

  it('후속 저장 실패는 부분 성공이지만 pending 재시도는 노출하지 않아요', () => {
    expect(
      getBackupRestorePresentation({ status: 'partial', reason: 'follow-up-failed' }),
    ).toMatchObject({
      kind: 'partial',
      retryPendingBackup: false,
    });
  });

  it.each([
    'backup-unavailable',
    'protection-failed',
    'restore-failed',
  ] as const)('%s는 실패로 안내해요', (reason) => {
    expect(
      getBackupRestorePresentation({ status: 'failure', reason }),
    ).toMatchObject({
      kind: 'failure',
      retryPendingBackup: false,
    });
  });
});
