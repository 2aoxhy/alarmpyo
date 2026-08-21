import { describe, expect, it, vi } from 'vitest';

vi.mock('../../infrastructure/alarmpyo-native-module', () => ({
  getAlarmPyoNativeModule: () => null,
}));

// eslint-disable-next-line import/first
import {
  createQuickTimerController,
  type QuickTimerControllerPort,
  type QuickTimerStatus,
} from './quick-timer-controller';

function status(state: QuickTimerStatus['state']): QuickTimerStatus {
  return {
    active: state === 'scheduled',
    durationMinutes: state === 'idle' ? null : 30,
    fireAt: state === 'scheduled' ? 2 : 0,
    isRepeat: false,
    remainingMillis: state === 'idle' ? 0 : 60_000,
    requiredAction: 'none',
    startedAt: state === 'idle' ? 0 : 1,
    state,
    storageHealth: 'normal',
    supported: true,
  };
}

describe('빠른 타이머 controller', () => {
  it('화면 요청을 주입된 port에 그대로 전달합니다', async () => {
    const port: QuickTimerControllerPort = {
      getStatus: vi.fn(async () => status('idle')),
      pause: vi.fn(async () => status('paused')),
      reset: vi.fn(async () => status('idle')),
      resume: vi.fn(async () => status('scheduled')),
      schedule: vi.fn(async () => status('scheduled')),
    };
    const controller = createQuickTimerController(port);

    expect(controller.durations).toEqual([15, 30, 45, 60]);
    await expect(controller.getStatus()).resolves.toMatchObject({ state: 'idle' });
    await expect(controller.schedule(15)).resolves.toMatchObject({ state: 'scheduled' });
    await expect(controller.pause()).resolves.toMatchObject({ state: 'paused' });
    await expect(controller.resume()).resolves.toMatchObject({ state: 'scheduled' });
    await expect(controller.reset()).resolves.toMatchObject({ state: 'idle' });
    expect(port.schedule).toHaveBeenCalledWith(15);
  });
});
