import type { LatestBackupRestoreResult } from '@/store/app-store';

export type BackupRestorePresentation = {
  kind: 'success' | 'partial' | 'failure';
  title: string;
  message: string;
  retryPendingBackup: boolean;
};

/** 최근 안전 백업 복원 결과를 실제 저장 상태에 맞는 문구로 바꿔요. */
export function getBackupRestorePresentation(
  result: LatestBackupRestoreResult,
): BackupRestorePresentation {
  if (result.status === 'success') {
    return {
      kind: 'success',
      title: '안전 백업을 복구했습니다',
      message:
        '근무표와 설정을 백업 내용으로 변경하고, 복원 전 상태도 안전하게 보관했습니다.',
      retryPendingBackup: false,
    };
  }

  if (result.status === 'partial') {
    if (result.reason === 'backup-pending') {
      return {
        kind: 'partial',
        title: '근무표는 복구했습니다',
        message:
          '복원 전 상태는 별도 스냅샷에 보관했습니다. 최근 안전 백업으로 저장을 마무리해야 합니다.',
        retryPendingBackup: true,
      };
    }
    return {
      kind: 'partial',
      title: '근무표는 복구했습니다',
      message:
        '일부 후속 저장을 마치지 못했습니다. 상단 안내에서 다시 시도해야 합니다.',
      retryPendingBackup: false,
    };
  }

  const message = {
    'backup-unavailable':
      '복원할 백업을 읽지 못했습니다. 현재 근무표는 유지했습니다.',
    'protection-failed':
      '복원 전 상태를 안전하게 보관하지 못해 복원을 시작하지 않았습니다.',
    'restore-failed':
      '백업 내용을 저장하지 못했습니다. 현재 근무표는 유지했습니다.',
  }[result.reason];
  return {
    kind: 'failure',
    title: '백업을 복구하지 못했습니다',
    message,
    retryPendingBackup: false,
  };
}
