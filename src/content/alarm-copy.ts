import { defineCopy, defineCopyCatalog } from './copy-contract';

export const alarmCopy = defineCopyCatalog({
  permissionRequired: defineCopy('requirement', '알람 권한을 허용해야 합니다.'),
  ready: defineCopy('sentence', '알람을 사용할 준비가 완료되었습니다.'),
  unavailable: defineCopy(
    'sentence',
    '현재 기기에서는 알람 상태를 확인할 수 없습니다.',
  ),
  openSettings: defineCopy('action', '알람 설정 확인'),
  testAlarm: defineCopy('action', '시험 알람 울리기'),
});
