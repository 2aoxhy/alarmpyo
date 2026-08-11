import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native } = vi.hoisted(() => ({
  native: {
    getAlarmSoundAsync: vi.fn(),
    selectAlarmSoundAsync: vi.fn(),
    previewAlarmSoundAsync: vi.fn(),
    stopAlarmSoundPreviewAsync: vi.fn(),
    resetAlarmSoundAsync: vi.fn(),
  },
}));

vi.mock('../../infrastructure/alarmpyo-native-module', () => ({
  getAlarmPyoNativeModule: () => native,
}));

// Vitest hoisted mock을 실제 서비스 모듈보다 먼저 준비해야 해요.
// eslint-disable-next-line import/first
import {
  getAlarmSound,
  isAlarmSoundSelectionSupported,
  normalizeAlarmSoundStatus,
  previewAlarmSound,
  resetAlarmSound,
  selectAlarmSound,
  stopAlarmSoundPreview,
} from '../alarm-sound-service';

describe('시스템 알람음 서비스', () => {
  beforeEach(() => vi.clearAllMocks());

  it('네이티브 상태를 안전하게 정규화해요', () => {
    expect(normalizeAlarmSoundStatus(null)).toEqual({
      supported: false,
      selected: false,
      label: '시스템 기본 알람음',
      available: false,
    });
    expect(normalizeAlarmSoundStatus({
      supported: true,
      selected: true,
      label: '  Morning  ',
      available: true,
    })).toEqual({
      supported: true,
      selected: true,
      label: 'Morning',
      available: true,
    });
  });

  it('조회·선택·기본값 복원을 네이티브 모듈에 전달해요', async () => {
    native.getAlarmSoundAsync.mockResolvedValue({
      supported: true,
      selected: false,
      label: '기본 알람',
      available: true,
    });
    native.selectAlarmSoundAsync.mockResolvedValue({
      supported: true,
      selected: true,
      label: '새 알람',
      available: true,
    });
    native.resetAlarmSoundAsync.mockResolvedValue({
      supported: true,
      selected: false,
      label: '기본 알람',
      available: true,
    });

    expect(isAlarmSoundSelectionSupported()).toBe(true);
    await expect(getAlarmSound()).resolves.toMatchObject({ label: '기본 알람' });
    await expect(selectAlarmSound()).resolves.toMatchObject({ label: '새 알람' });
    await expect(resetAlarmSound()).resolves.toMatchObject({ selected: false });
  });

  it('미리 듣기와 중지를 명확한 boolean으로 반환해요', async () => {
    native.previewAlarmSoundAsync.mockResolvedValue(true);
    native.stopAlarmSoundPreviewAsync.mockResolvedValue(false);
    await expect(previewAlarmSound()).resolves.toBe(true);
    await expect(stopAlarmSoundPreview()).resolves.toBe(false);
  });
});
