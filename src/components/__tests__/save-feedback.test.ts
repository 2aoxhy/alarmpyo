import { describe, expect, it } from 'vitest';

import {
  getAlarmSyncErrorPresentation,
  getSaveErrorPresentation,
  shouldExpandSaveErrorBanner,
} from '../save-feedback';

describe('저장 상태 안내 문구', () => {
  it('좁은 화면이나 큰 글자에서는 오류 배너를 축소 상태로 시작해요', () => {
    expect(shouldExpandSaveErrorBanner(320, 1)).toBe(false);
    expect(shouldExpandSaveErrorBanner(412, 1.4)).toBe(false);
    expect(shouldExpandSaveErrorBanner(412, 1)).toBe(true);
  });

  it('저장과 별개의 알람 동기화 오류를 전역 경고로 보여 줘요', () => {
    expect(
      getAlarmSyncErrorPresentation(
        '알람을 다시 예약하지 못했어요.',
      ),
    ).toEqual({
      kind: 'partial',
      title: '알람 예약을 확인해 주세요',
      message: '알람을 다시 예약하지 못했어요.',
    });
  });

  it('자료 저장 뒤 알람만 실패하면 부분 실패로 안내해요', () => {
    expect(
      getSaveErrorPresentation(
        '변경 내용은 저장했지만 알람을 다시 예약하지 못했어요. 알람 권한을 확인해 주세요.',
      ),
    ).toEqual({
      kind: 'partial',
      title: '알람 예약을 확인해 주세요',
      message: '변경 내용은 저장됐어요. 알람 화면에서 권한을 확인한 뒤 다시 예약해 주세요.',
    });
  });

  it('알람을 끈 뒤 기존 예약 취소 실패도 부분 실패로 안내해요', () => {
    expect(
      getSaveErrorPresentation(
        '알람을 끄는 설정은 저장했지만 기존 예약을 취소하지 못했어요. 알람 화면에서 다시 시도해 주세요.',
      ),
    ).toEqual({
      kind: 'partial',
      title: '알람 예약을 확인해 주세요',
      message: '변경 내용은 저장됐어요. 알람 화면에서 권한을 확인한 뒤 다시 예약해 주세요.',
    });
  });

  it('자료 저장 뒤 안전 백업만 실패하면 같은 용어로 안내해요', () => {
    expect(
      getSaveErrorPresentation(
        '근무표는 저장했지만 안전 복사본을 만들지 못했어요. 다시 저장해 주세요.',
      ),
    ).toEqual({
      kind: 'partial',
      title: '안전 백업을 확인해 주세요',
      message: '근무표는 저장됐어요. 다시 시도해 안전 백업을 만들어 주세요.',
    });
  });

  it('기기 파일 백업만 실패해도 저장 완료와 후속 조치를 구분해요', () => {
    expect(
      getSaveErrorPresentation(
        '근무표는 저장했지만 기기 안전 백업 파일을 갱신하지 못했어요.',
      ),
    ).toEqual({
      kind: 'partial',
      title: '안전 백업을 확인해 주세요',
      message: '근무표는 저장됐어요. 다시 시도해 안전 백업을 만들어 주세요.',
    });
  });

  it('근무표 복원 후 복원 전 백업만 실패하면 부분 실패로 안내해요', () => {
    expect(
      getSaveErrorPresentation(
        '근무표는 복원했지만 되돌리기 전 상태를 안전 백업하지 못했어요.',
      ),
    ).toEqual({
      kind: 'partial',
      title: '복원 전 백업을 확인해 주세요',
      message: '근무표는 복원됐어요. 저장 공간을 확인한 후 다시 백업해 주세요.',
    });
  });

  it('본문 저장 실패는 전체 저장 실패로 안내해요', () => {
    expect(
      getSaveErrorPresentation(
        '변경 내용을 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.',
      ),
    ).toEqual({
      kind: 'error',
      title: '변경 내용을 저장하지 못했어요',
      message: '저장 공간을 확인한 후 다시 시도해 주세요.',
    });
  });
});
