export type SaveFeedbackPresentation = {
  title: string;
  message: string;
  kind: 'partial' | 'error';
};

const DEFAULT_SAVE_ERROR = '저장 공간을 확인한 후 다시 시도해 주세요.';
const DEFAULT_ALARM_SYNC_ERROR =
  '변경 내용은 저장됐어요. 알람만 근무표에 맞춰 다시 예약해 주세요.';

/** 좁은 화면과 큰 글자에서는 오류 안내가 콘텐츠를 덮지 않도록 작게 시작해요. */
export function shouldExpandSaveErrorBanner(
  viewportWidth: number,
  fontScale: number,
): boolean {
  const safeWidth = Number.isFinite(viewportWidth) ? viewportWidth : 320;
  const safeFontScale = Number.isFinite(fontScale) ? fontScale : 1;
  return safeWidth >= 360 && safeFontScale < 1.25;
}

/** 저장은 성공했지만 알람 후속 처리만 실패한 상태를 전역에서 같은 문구로 안내해요. */
export function getAlarmSyncErrorPresentation(
  error: string | null,
): SaveFeedbackPresentation {
  return {
    kind: 'partial',
    title: '알람 예약을 확인해 주세요',
    message: error?.trim() || DEFAULT_ALARM_SYNC_ERROR,
  };
}

/** 저장 자체의 실패와 저장 뒤 후속 처리 실패를 사용자에게 정확히 구분해요. */
export function getSaveErrorPresentation(
  error: string | null,
): SaveFeedbackPresentation {
  const message = error?.trim() || DEFAULT_SAVE_ERROR;

  if (
    message.includes('저장했지만 알람') ||
    message.includes('알람 사용 안 함은 저장했지만') ||
    message.includes('알람을 끄는 설정은 저장했지만')
  ) {
    return {
      kind: 'partial',
      title: '알람 예약을 확인해 주세요',
      message: '변경 내용은 저장됐어요. 알람 화면에서 권한을 확인한 뒤 다시 예약해 주세요.',
    };
  }

  if (
    message.includes('근무표는 저장했지만 안전 복사본') ||
    message.includes('근무표는 저장했지만 안전 백업') ||
    message.includes('근무표는 저장했지만 기기 안전 백업')
  ) {
    return {
      kind: 'partial',
      title: '안전 백업을 확인해 주세요',
      message: '근무표는 저장됐어요. 다시 시도해 안전 백업을 만들어 주세요.',
    };
  }

  if (message.includes('근무표는 복원했지만')) {
    return {
      kind: 'partial',
      title: '복원 전 백업을 확인해 주세요',
      message: '근무표는 복원됐어요. 저장 공간을 확인한 후 다시 백업해 주세요.',
    };
  }

  if (message.includes('형식이 올바르지')) {
    return {
      kind: 'error',
      title: '변경 내용을 저장하지 못했어요',
      message: '변경 내용의 형식을 확인한 후 다시 시도해 주세요.',
    };
  }

  if (message.includes('되돌리기 전 상태의 안전 백업')) {
    return {
      kind: 'error',
      title: '안전 백업을 만들지 못했어요',
      message: '되돌리기 전 상태를 백업하지 못했어요. 저장 공간을 확인해 주세요.',
    };
  }

  if (message.includes('안전 백업을 저장하지 못')) {
    return {
      kind: 'error',
      title: '안전 백업을 만들지 못했어요',
      message: '저장 공간을 확인한 후 다시 시도해 주세요.',
    };
  }

  if (message.includes('저장 공간')) {
    return {
      kind: 'error',
      title: '변경 내용을 저장하지 못했어요',
      message: DEFAULT_SAVE_ERROR,
    };
  }

  return {
    kind: 'error',
    title: '변경 내용을 저장하지 못했어요',
    message,
  };
}
