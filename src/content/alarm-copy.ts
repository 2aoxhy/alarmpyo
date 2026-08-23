import { defineCopy, defineCopyCatalog } from './copy-contract';

export const alarmCopy = defineCopyCatalog({
  permissionRequired: defineCopy('requirement', '알람 권한 필요'),
  ready: defineCopy('sentence', '알람 준비 완료'),
  unavailable: defineCopy(
    'sentence',
    '알람 상태 확인 불가',
  ),
  openSettings: defineCopy('action', '알람 설정 확인'),
  testAlarm: defineCopy('action', '시험 알람 울리기'),
});
