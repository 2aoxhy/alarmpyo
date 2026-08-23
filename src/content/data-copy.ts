import { defineCopy, defineCopyCatalog } from './copy-contract';

export const dataCopy = defineCopyCatalog({
  saveComplete: defineCopy('sentence', '저장 완료'),
  saveFailed: defineCopy('sentence', '저장 실패'),
  invalidSchedule: defineCopy(
    'requirement',
    '근무 시간·순서 확인',
  ),
  restoreQuestion: defineCopy('question', '이 백업을 복원하시겠습니까?'),
  managementSummary: defineCopy('label', '백업·업데이트·개인정보'),
  backupSection: defineCopy('label', '백업·복구'),
  backup: defineCopy('action', '백업'),
  restore: defineCopy('action', '복원'),
});
