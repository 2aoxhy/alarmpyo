import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native } = vi.hoisted(() => ({
  native: {
    getQuickTimerStatusAsync: vi.fn(),
    scheduleQuickTimerAsync: vi.fn(),
    pauseQuickTimerAsync: vi.fn(),
    resumeQuickTimerAsync: vi.fn(),
    resetQuickTimerAsync: vi.fn(),
    cancelQuickTimerAsync: vi.fn(),
  } as {
    getQuickTimerStatusAsync?: ReturnType<typeof vi.fn>;
    scheduleQuickTimerAsync?: ReturnType<typeof vi.fn>;
    pauseQuickTimerAsync?: ReturnType<typeof vi.fn>;
    resumeQuickTimerAsync?: ReturnType<typeof vi.fn>;
    resetQuickTimerAsync?: ReturnType<typeof vi.fn>;
    cancelQuickTimerAsync?: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('../../infrastructure/alarmpyo-native-module', () => ({
  getAlarmPyoNativeModule: () => native,
}));

// eslint-disable-next-line import/first
import {
  cancelQuickTimer,
  getQuickTimerStatus,
  normalizeQuickTimerStatus,
  pauseQuickTimer,
  resetQuickTimer,
  resumeQuickTimer,
  scheduleQuickTimer,
  type QuickTimerDuration,
} from '../quick-timer-service';

function scheduledStatus(durationMinutes: 30 | 45 | 60 = 30) {
  return {
    supported: true,
    state: 'scheduled',
    active: true,
    durationMinutes,
    startedAt: 1_000,
    fireAt: 1_000 + durationMinutes * 60_000,
    remainingMillis: durationMinutes * 60_000,
    isRepeat: false,
    storageHealth: 'normal',
    requiredAction: 'none',
  };
}

describe('빠른 타이머 서비스', () => {
  beforeEach(() => {
    native.getQuickTimerStatusAsync = vi.fn();
    native.scheduleQuickTimerAsync = vi.fn();
    native.pauseQuickTimerAsync = vi.fn();
    native.resumeQuickTimerAsync = vi.fn();
    native.resetQuickTimerAsync = vi.fn();
    native.cancelQuickTimerAsync = vi.fn();
  });

  it('네이티브 상태를 안전하게 정규화해요', () => {
    expect(normalizeQuickTimerStatus(scheduledStatus())).toEqual(
      scheduledStatus(),
    );
    expect(
      normalizeQuickTimerStatus({
        ...scheduledStatus(),
        durationMinutes: 45,
      }),
    ).toMatchObject({
      supported: true,
      state: 'scheduled',
      active: true,
      durationMinutes: 45,
    });
    expect(
      normalizeQuickTimerStatus({
        ...scheduledStatus(45),
        state: 'paused',
        active: false,
        fireAt: 0,
        remainingMillis: 12_000,
      }),
    ).toMatchObject({
      supported: true,
      state: 'paused',
      active: false,
      durationMinutes: 45,
      remainingMillis: 12_000,
    });
    expect(normalizeQuickTimerStatus(null)).toMatchObject({
      supported: false,
      state: 'idle',
      active: false,
    });
  });

  it('30분·45분·60분 예약과 취소만 네이티브 모듈에 전달해요', async () => {
    native.scheduleQuickTimerAsync!.mockResolvedValue(scheduledStatus(45));
    native.cancelQuickTimerAsync!.mockResolvedValue({
      ...scheduledStatus(60),
      state: 'idle',
      active: false,
      durationMinutes: null,
      startedAt: 0,
      fireAt: 0,
      remainingMillis: 0,
    });

    await expect(scheduleQuickTimer(45)).resolves.toMatchObject({
      active: true,
      durationMinutes: 45,
    });
    expect(native.scheduleQuickTimerAsync).toHaveBeenCalledWith(45);
    await expect(cancelQuickTimer()).resolves.toMatchObject({ active: false });
    await expect(
      scheduleQuickTimer(15 as QuickTimerDuration),
    ).rejects.toThrow('30분, 45분 또는 60분');
  });

  it('일시정지·재개·초기화를 순서대로 직렬화해요', async () => {
    const paused = {
      ...scheduledStatus(45),
      state: 'paused',
      active: false,
      fireAt: 0,
      remainingMillis: 10_000,
    };
    native.pauseQuickTimerAsync!.mockResolvedValue(paused);
    native.resumeQuickTimerAsync!.mockResolvedValue(scheduledStatus(45));
    native.resetQuickTimerAsync!.mockResolvedValue({
      ...scheduledStatus(45),
      state: 'idle',
      active: false,
      durationMinutes: null,
      startedAt: 0,
      fireAt: 0,
      remainingMillis: 0,
    });

    await expect(pauseQuickTimer()).resolves.toMatchObject({ state: 'paused' });
    await expect(resumeQuickTimer()).resolves.toMatchObject({ state: 'scheduled' });
    await expect(resetQuickTimer()).resolves.toMatchObject({ state: 'idle' });
    expect(native.pauseQuickTimerAsync).toHaveBeenCalledOnce();
    expect(native.resumeQuickTimerAsync).toHaveBeenCalledOnce();
    expect(native.resetQuickTimerAsync).toHaveBeenCalledOnce();
  });

  it('구형 APK처럼 메서드가 하나라도 없으면 지원하지 않는 상태로 폴백해요', async () => {
    native.getQuickTimerStatusAsync = undefined;

    await expect(getQuickTimerStatus()).resolves.toMatchObject({
      supported: false,
      state: 'idle',
      active: false,
      durationMinutes: null,
    });
  });
});
