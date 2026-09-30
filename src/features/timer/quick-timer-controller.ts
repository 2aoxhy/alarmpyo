import {
  getQuickTimerStatus,
  pauseQuickTimer,
  QUICK_TIMER_DURATIONS,
  resetQuickTimer,
  resumeQuickTimer,
  scheduleQuickTimer,
  type QuickTimerDuration,
  type QuickTimerStatus,
} from '../../services/quick-timer-service';

export type QuickTimerControllerPort = Readonly<{
  getStatus: () => Promise<QuickTimerStatus>;
  pause: () => Promise<QuickTimerStatus>;
  reset: () => Promise<QuickTimerStatus>;
  resume: () => Promise<QuickTimerStatus>;
  schedule: (durationMinutes: QuickTimerDuration) => Promise<QuickTimerStatus>;
}>;

export type QuickTimerController = Readonly<{
  durations: readonly QuickTimerDuration[];
  getStatus: () => Promise<QuickTimerStatus>;
  pause: () => Promise<QuickTimerStatus>;
  reset: () => Promise<QuickTimerStatus>;
  resume: () => Promise<QuickTimerStatus>;
  schedule: (durationMinutes: QuickTimerDuration) => Promise<QuickTimerStatus>;
}>;

const nativeQuickTimerPort: QuickTimerControllerPort = {
  getStatus: getQuickTimerStatus,
  pause: pauseQuickTimer,
  reset: resetQuickTimer,
  resume: resumeQuickTimer,
  schedule: scheduleQuickTimer,
};

/**
 * 화면 상태와 네이티브 타이머 구현 사이의 기능 경계입니다.
 * 테스트에서는 port를 바꿔도 화면과 네이티브 저장 계약을 수정할 필요가 없습니다.
 */
export function createQuickTimerController(
  port: QuickTimerControllerPort = nativeQuickTimerPort,
): QuickTimerController {
  // Reads join the same queue as writes: a delayed native read cannot race a
  // schedule/pause/reset, including after a screen has been remounted.
  let tail: Promise<void> = Promise.resolve();
  const serialize = (operation: () => Promise<QuickTimerStatus>) => {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  return {
    durations: QUICK_TIMER_DURATIONS,
    getStatus: () => serialize(() => port.getStatus()),
    pause: () => serialize(() => port.pause()),
    reset: () => serialize(() => port.reset()),
    resume: () => serialize(() => port.resume()),
    schedule: (durationMinutes) => serialize(() => port.schedule(durationMinutes)),
  };
}

export const quickTimerController = createQuickTimerController();

export type { QuickTimerDuration, QuickTimerStatus };
