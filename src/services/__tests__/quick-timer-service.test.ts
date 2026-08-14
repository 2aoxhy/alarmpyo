import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native } = vi.hoisted(() => ({
  native: {
    getQuickTimerStatusAsync: vi.fn(),
    scheduleQuickTimerAsync: vi.fn(),
    cancelQuickTimerAsync: vi.fn(),
  } as {
    getQuickTimerStatusAsync?: ReturnType<typeof vi.fn>;
    scheduleQuickTimerAsync?: ReturnType<typeof vi.fn>;
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
  scheduleQuickTimer,
  type QuickTimerDuration,
} from '../quick-timer-service';

function scheduledStatus(durationMinutes: 30 | 60 = 30) {
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
      state: 'error',
      active: false,
      durationMinutes: null,
    });
    expect(normalizeQuickTimerStatus(null)).toMatchObject({
      supported: false,
      state: 'idle',
      active: false,
    });
  });

  it('30분·60분 예약과 취소만 네이티브 모듈에 전달해요', async () => {
    native.scheduleQuickTimerAsync!.mockResolvedValue(scheduledStatus(60));
    native.cancelQuickTimerAsync!.mockResolvedValue({
      ...scheduledStatus(60),
      state: 'idle',
      active: false,
      durationMinutes: null,
      startedAt: 0,
      fireAt: 0,
      remainingMillis: 0,
    });

    await expect(scheduleQuickTimer(60)).resolves.toMatchObject({
      active: true,
      durationMinutes: 60,
    });
    expect(native.scheduleQuickTimerAsync).toHaveBeenCalledWith(60);
    await expect(cancelQuickTimer()).resolves.toMatchObject({ active: false });
    await expect(
      scheduleQuickTimer(45 as QuickTimerDuration),
    ).rejects.toThrow('30분 또는 60분');
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
