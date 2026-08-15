import { defineCopy, defineCopyCatalog } from './copy-contract';

export const dataCopy = defineCopyCatalog({
  saveComplete: defineCopy('sentence', '자료 저장이 완료되었습니다.'),
  saveFailed: defineCopy('sentence', '자료를 저장하지 못했습니다.'),
  invalidSchedule: defineCopy(
    'requirement',
    '근무 시간과 순서를 확인해야 합니다.',
  ),
  restoreQuestion: defineCopy('question', '이 백업을 불러오시겠습니까?'),
  managementSummary: defineCopy('label', '백업·업데이트·개인정보'),
  backupSection: defineCopy('label', '백업 및 복구'),
  backup: defineCopy('action', '백업'),
  restore: defineCopy('action', '복원'),
});
