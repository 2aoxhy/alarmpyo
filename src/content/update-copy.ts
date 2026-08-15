import { defineCopy, defineCopyCatalog } from './copy-contract';

export const updateCopy = defineCopyCatalog({
  upToDate: defineCopy('sentence', '최신 버전을 사용하고 있습니다.'),
  checkFailed: defineCopy('sentence', '업데이트를 확인하지 못했습니다.'),
  playManaged: defineCopy(
    'sentence',
    '새 버전은 Google Play가 안전하게 설치하고 관리합니다.',
  ),
  playTitle: defineCopy('label', 'Google Play에서 업데이트'),
  checkFailedTitle: defineCopy('label', '업데이트를 확인하지 못했습니다'),
  updateInPlay: defineCopy('action', 'Google Play에서 업데이트'),
});
