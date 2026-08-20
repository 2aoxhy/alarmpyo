import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getUtf8ByteLength } from '../../utils/utf8';
import {
  pickAndValidateShiftPatternFile,
  pickShiftPatternFile,
  shareShiftPatternFile,
} from '../shift-pattern-file-service';
import { MAX_SHIFT_PATTERN_BYTES, serializeUserShiftPattern } from '../shift-pattern-schema';

const fileSystem = vi.hoisted(() => ({
  writeAsStringAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));
const sharing = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));
const documentPicker = vi.hoisted(() => ({ getDocumentAsync: vi.fn() }));

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'cache://',
  EncodingType: { UTF8: 'utf8' },
  ...fileSystem,
}));
vi.mock('expo-sharing', () => sharing);
vi.mock('expo-document-picker', () => documentPicker);

function userPatternContents() {
  return serializeUserShiftPattern({
    id: 'team-pattern',
    name: '우리 회사 패턴',
    anchorDate: '2026-08-01',
    shiftCodes: ['DAY', 'NIGHT', 'OFF'],
    createdAt: '2026-08-20T00:00:00.000Z',
  });
}

describe('.shiftpattern.json 파일 입출력', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileSystem.writeAsStringAsync.mockResolvedValue(undefined);
    fileSystem.readDirectoryAsync.mockResolvedValue([]);
    fileSystem.deleteAsync.mockResolvedValue(undefined);
    sharing.isAvailableAsync.mockResolvedValue(true);
    sharing.shareAsync.mockResolvedValue(undefined);
  });

  it('선택 파일의 확장자·실제 크기를 확인하고 캐시 복사본을 정리합니다', async () => {
    const contents = userPatternContents();
    const size = getUtf8ByteLength(contents);
    documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: 'team.shiftpattern.json', uri: 'cache://picked', size }],
    });
    fileSystem.getInfoAsync.mockResolvedValue({ exists: true, size });
    fileSystem.readAsStringAsync.mockResolvedValue(contents);

    await expect(pickAndValidateShiftPatternFile()).resolves.toMatchObject({
      fileName: 'team.shiftpattern.json',
      pattern: { id: 'team-pattern', verification: { status: 'user-validated' } },
    });
    expect(fileSystem.deleteAsync).toHaveBeenCalledWith('cache://picked', {
      idempotent: true,
    });
  });

  it('다른 확장자와 256KB 초과 파일은 내용을 읽기 전에 거부합니다', async () => {
    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'pattern.json', uri: 'cache://wrong-extension', size: 10 }],
    });
    await expect(pickShiftPatternFile()).rejects.toMatchObject({ code: 'invalid-schema' });

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: 'large.shiftpattern.json',
          uri: 'cache://too-large',
          size: MAX_SHIFT_PATTERN_BYTES + 1,
        },
      ],
    });
    await expect(pickShiftPatternFile()).rejects.toMatchObject({ code: 'file-too-large' });
    expect(fileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  it('검증한 문서만 고정 확장자로 공유하고 이전 패턴 export만 정리합니다', async () => {
    const contents = userPatternContents();
    const size = getUtf8ByteLength(contents);
    fileSystem.readDirectoryAsync.mockResolvedValue([
      'AlarmPyo-old-2026-08-19.shiftpattern.json',
      'unrelated.json',
    ]);
    fileSystem.getInfoAsync.mockResolvedValue({ exists: true, size });

    await expect(shareShiftPatternFile(contents)).resolves.toEqual({
      fileName: expect.stringMatching(
        /^AlarmPyo-team-pattern-\d{4}-\d{2}-\d{2}\.shiftpattern\.json$/u,
      ),
      storageStatus: 'unconfirmed',
    });
    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(
      'cache://AlarmPyo-old-2026-08-19.shiftpattern.json',
      { idempotent: true },
    );
    expect(sharing.shareAsync).toHaveBeenCalledOnce();
  });
});
