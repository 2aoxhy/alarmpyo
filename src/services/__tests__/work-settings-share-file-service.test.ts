import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shareWorkSettingsFile } from '../work-settings-share-file-service';

const fileSystem = vi.hoisted(() => ({
  writeAsStringAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));
const sharing = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'cache://',
  EncodingType: { UTF8: 'utf8' },
  ...fileSystem,
}));
vi.mock('expo-sharing', () => sharing);
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }));

describe('근무 설정 파일 공유', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileSystem.writeAsStringAsync.mockResolvedValue(undefined);
    fileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 2 });
    fileSystem.readDirectoryAsync.mockResolvedValue([]);
    fileSystem.deleteAsync.mockResolvedValue(undefined);
    sharing.isAvailableAsync.mockResolvedValue(true);
    sharing.shareAsync.mockResolvedValue(undefined);
  });

  it('공유한 파일은 대상 앱이 늦게 읽을 수 있도록 다음 내보내기까지 유지해요', async () => {
    await expect(shareWorkSettingsFile('{}')).resolves.toMatch(/^AlarmPyo-근무설정-/);

    expect(sharing.shareAsync).toHaveBeenCalledOnce();
    expect(fileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it('이전 내보내기만 새 파일을 만들기 전에 정리해요', async () => {
    fileSystem.readDirectoryAsync.mockResolvedValue([
      'AlarmPyo-근무설정-2026-07-13.json',
      'AlarmPyo-근무설정-2026-07-14.json',
      '다른-캐시.json',
    ]);

    await shareWorkSettingsFile('{}');

    expect(fileSystem.deleteAsync).toHaveBeenCalledTimes(2);
    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(
      'cache://AlarmPyo-근무설정-2026-07-13.json',
      { idempotent: true },
    );
    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(
      'cache://AlarmPyo-근무설정-2026-07-14.json',
      { idempotent: true },
    );
  });

  it('공유 화면을 열지 못한 새 파일은 즉시 정리해요', async () => {
    sharing.shareAsync.mockRejectedValue(new Error('공유 실패'));

    await expect(shareWorkSettingsFile('{}')).rejects.toThrow('공유 실패');
    expect(fileSystem.deleteAsync).toHaveBeenCalledOnce();
  });
});
