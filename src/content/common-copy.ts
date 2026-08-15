import { defineCopy, defineCopyCatalog } from './copy-contract';

export const commonCopy = defineCopyCatalog({
  confirm: defineCopy('action', '확인'),
  cancel: defineCopy('action', '취소'),
  save: defineCopy('action', '저장'),
  retry: defineCopy('action', '다시 시도'),
  openSettings: defineCopy('action', '설정 열기'),
  closeDialogLabel: defineCopy('a11yLabel', '팝업 닫기'),
  providerUnavailable: defineCopy(
    'sentence',
    '앱 팝업 제공자가 준비되지 않았습니다.',
  ),
});
