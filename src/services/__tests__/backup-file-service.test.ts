import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getUtf8ByteLength } from '../../utils/utf8';
import {
  MAX_BACKUP_FILE_BYTES,
  MAX_BACKUP_IMPORT_FILE_BYTES,
} from '../backup-file-policy';
import { exportBackupFile, pickBackupFile } from '../backup-file-service';

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
const documentPicker = vi.hoisted(() => ({
  getDocumentAsync: vi.fn(),
}));

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'cache://',
  EncodingType: { UTF8: 'utf8' },
  ...fileSystem,
}));
vi.mock('expo-sharing', () => sharing);
vi.mock('expo-document-picker', () => documentPicker);

describe('백업 파일 내보내기와 가져오기', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileSystem.writeAsStringAsync.mockResolvedValue(undefined);
    fileSystem.readDirectoryAsync.mockResolvedValue([]);
    fileSystem.deleteAsync.mockResolvedValue(undefined);
    sharing.isAvailableAsync.mockResolvedValue(true);
    sharing.shareAsync.mockResolvedValue(undefined);
  });

  it('내보내기도 4MB를 넘는 UTF-8 내용을 파일 생성 전에 거부합니다', async () => {
    const oversized = 'a'.repeat(MAX_BACKUP_FILE_BYTES + 1);

    await expect(exportBackupFile(oversized)).rejects.toThrow(
      '백업 파일은 4MB 이하여야 합니다',
    );
    expect(fileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('기존 1MB보다 큰 UTF-8 백업을 내보냅니다', async () => {
    const contents = '근'.repeat(400_000);
    const size = getUtf8ByteLength(contents);
    fileSystem.getInfoAsync.mockResolvedValue({ exists: true, size });

    await expect(exportBackupFile(contents)).resolves.toEqual({
      fileName: expect.stringMatching(/^AlarmPyo-백업-/),
      storageStatus: 'unconfirmed',
    });
    expect(fileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^cache:\/\/AlarmPyo-백업-/),
      contents,
      { encoding: 'utf8' },
    );
    expect(sharing.shareAsync).toHaveBeenCalledOnce();
    expect(fileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it('암호화 백업은 전용 확장자와 MIME으로 6MB까지 공유해요', async () => {
    const contents = 'a'.repeat(5 * 1024 * 1024);
    fileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: getUtf8ByteLength(contents),
    });

    await expect(
      exportBackupFile(contents, { encrypted: true }),
    ).resolves.toEqual({
      fileName: expect.stringMatching(/^AlarmPyo-암호화-백업-.*\.alarmpyo$/),
      storageStatus: 'unconfirmed',
    });
    expect(sharing.shareAsync).toHaveBeenCalledWith(
      expect.stringMatching(/\.alarmpyo$/),
      expect.objectContaining({
        mimeType: 'application/octet-stream',
        UTI: 'public.data',
      }),
    );
  });

  it.each([
    ['보호되지 않은 백업', false],
    ['암호화 백업', true],
  ] as const)(
    '공유 화면 취소 여부를 알 수 없는 %s은 저장 미확인으로 반환해요',
    async (_label, encrypted) => {
      const contents = encrypted ? '{"encrypted":true}' : '{"plain":true}';
      fileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        size: getUtf8ByteLength(contents),
      });
      // Expo Sharing은 저장과 취소 모두 결과 없이 resolve하므로 취소로 가정해요.
      sharing.shareAsync.mockResolvedValueOnce(undefined);

      await expect(exportBackupFile(contents, { encrypted })).resolves.toEqual({
        fileName: expect.any(String),
        storageStatus: 'unconfirmed',
      });
    },
  );

  it('이전 내보내기 파일은 다음 백업을 만들 때 정리합니다', async () => {
    const contents = '{"ok":true}';
    fileSystem.readDirectoryAsync.mockResolvedValue([
      'AlarmPyo-백업-2026-07-13-1200.json',
      'AlarmPyo-암호화-백업-2026-07-13-1201.alarmpyo',
      '다른-캐시.json',
    ]);
    fileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: getUtf8ByteLength(contents),
    });

    await exportBackupFile(contents);

    expect(fileSystem.deleteAsync).toHaveBeenCalledTimes(2);
    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(
      'cache://AlarmPyo-백업-2026-07-13-1200.json',
      { idempotent: true },
    );
    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(
      'cache://AlarmPyo-암호화-백업-2026-07-13-1201.alarmpyo',
      { idempotent: true },
    );
  });

  it('문서 선택을 취소하면 파일을 읽지 않습니다', async () => {
    documentPicker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickBackupFile()).resolves.toBeNull();
    expect(fileSystem.getInfoAsync).not.toHaveBeenCalled();
    expect(fileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  it('기존 1MB보다 큰 UTF-8 백업을 같은 제한으로 가져옵니다', async () => {
    const contents = '야'.repeat(400_000);
    const size = getUtf8ByteLength(contents);
    documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: 'AlarmPyo-백업.json', uri: 'cache://picked.json', size }],
    });
    fileSystem.getInfoAsync.mockResolvedValue({ exists: true, size });
    fileSystem.readAsStringAsync.mockResolvedValue(contents);

    await expect(pickBackupFile()).resolves.toEqual({
      fileName: 'AlarmPyo-백업.json',
      contents,
      encrypted: false,
    });
    expect(fileSystem.deleteAsync).toHaveBeenCalledWith('cache://picked.json', {
      idempotent: true,
    });
  });

  it('가져올 파일의 실제 크기와 해석한 UTF-8 크기가 다르면 거부합니다', async () => {
    documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: '손상.json', uri: 'cache://broken.json' }],
    });
    fileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 10 });
    fileSystem.readAsStringAsync.mockResolvedValue('{}');

    await expect(pickBackupFile()).rejects.toThrow('UTF-8 내용을 정확히 읽지 못했습니다');
    expect(fileSystem.deleteAsync).toHaveBeenCalledOnce();
  });

  it('.alarmpyo로 잘못 이름 붙인 평문 백업도 평문으로 읽어요', async () => {
    const contents = '{"format":"alarmpyo-backup","data":{}}';
    documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: '이름만-암호화.alarmpyo', uri: 'cache://plain.alarmpyo' }],
    });
    fileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: getUtf8ByteLength(contents),
    });
    fileSystem.readAsStringAsync.mockResolvedValue(contents);

    await expect(pickBackupFile()).resolves.toEqual({
      fileName: '이름만-암호화.alarmpyo',
      contents,
      encrypted: false,
    });
    expect(fileSystem.deleteAsync).toHaveBeenCalledOnce();
  });

  it('확장자가 없는 암호화 백업도 내용으로 판별해요', async () => {
    const contents =
      '{"format":"alarmpyo-encrypted-backup","version":1,"cipher":{}}';
    documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: 'AlarmPyo-백업', uri: 'cache://encrypted' }],
    });
    fileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: getUtf8ByteLength(contents),
    });
    fileSystem.readAsStringAsync.mockResolvedValue(contents);

    await expect(pickBackupFile()).resolves.toEqual({
      fileName: 'AlarmPyo-백업',
      contents,
      encrypted: true,
    });
  });

  it('암호화 내용은 평문 한도보다 커도 6MB까지 읽어요', async () => {
    const contents = `{"format":"alarmpyo-encrypted-backup","padding":"${'a'.repeat(
      MAX_BACKUP_FILE_BYTES,
    )}"}`;
    const size = getUtf8ByteLength(contents);
    documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: '확장자-없음', uri: 'cache://large-encrypted' }],
    });
    fileSystem.getInfoAsync.mockResolvedValue({ exists: true, size });
    fileSystem.readAsStringAsync.mockResolvedValue(contents);

    await expect(pickBackupFile()).resolves.toEqual({
      fileName: '확장자-없음',
      contents,
      encrypted: true,
    });
  });

  it('평문 내용은 .alarmpyo 확장자여도 4MB 한도를 적용해요', async () => {
    const contents = 'a'.repeat(MAX_BACKUP_FILE_BYTES + 1);
    const size = getUtf8ByteLength(contents);
    documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: '큰-평문.alarmpyo', uri: 'cache://large-plain' }],
    });
    fileSystem.getInfoAsync.mockResolvedValue({ exists: true, size });
    fileSystem.readAsStringAsync.mockResolvedValue(contents);

    await expect(pickBackupFile()).rejects.toThrow('4MB 이하여야 합니다');
  });

  it('6MB 절대 상한을 넘는 파일은 내용을 읽기 전에 거부해요', async () => {
    documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: '너무-큰-백업', uri: 'cache://too-large' }],
    });
    fileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: MAX_BACKUP_IMPORT_FILE_BYTES + 1,
    });

    await expect(pickBackupFile()).rejects.toThrow('6MB 이하여야 합니다');
    expect(fileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });
});
