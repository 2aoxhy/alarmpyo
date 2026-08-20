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
  return {
    durations: QUICK_TIMER_DURATIONS,
    getStatus: () => port.getStatus(),
    pause: () => port.pause(),
    reset: () => port.reset(),
    resume: () => port.resume(),
    schedule: (durationMinutes) => port.schedule(durationMinutes),
  };
}

export const quickTimerController = createQuickTimerController();

export type { QuickTimerDuration, QuickTimerStatus };
