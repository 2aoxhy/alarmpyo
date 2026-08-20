import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import {
  MAX_SHIFT_PATTERN_BYTES,
  ShiftPatternError,
  assertShiftPatternByteSize,
  parseAndValidateShiftPattern,
} from './shift-pattern-schema';

const EXPORTED_PATTERN_FILE = /^AlarmPyo-[a-z0-9._-]+-\d{4}-\d{2}-\d{2}\.shiftpattern\.json$/u;

function safePatternId(value: string): string {
  const normalized = value.normalize('NFC').toLowerCase().replace(/[^a-z0-9._-]+/gu, '-');
  return normalized.replace(/^-+|-+$/gu, '').slice(0, 48) || 'pattern';
}

function createShiftPatternFileName(id: string, now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `AlarmPyo-${safePatternId(id)}-${stamp}.shiftpattern.json`;
}

async function cleanupPreviousPatternExports(): Promise<void> {
  if (!FileSystem.cacheDirectory) return;
  const fileNames = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory).catch(() => []);
  await Promise.all(
    fileNames
      .filter((fileName) => EXPORTED_PATTERN_FILE.test(fileName))
      .map((fileName) =>
        FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${fileName}`, {
          idempotent: true,
        }).catch(() => undefined),
      ),
  );
}

export type PickedShiftPatternFile = {
  fileName: string;
  contents: string;
};

export async function pickShiftPatternFile(): Promise<PickedShiftPatternFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/json', 'text/json', 'text/plain', 'application/octet-stream'],
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) throw new ShiftPatternError('invalid-response', '선택한 패턴 파일을 읽을 수 없습니다.');
  try {
    if (!asset.name.toLowerCase().endsWith('.shiftpattern.json')) {
      throw new ShiftPatternError(
        'invalid-schema',
        '.shiftpattern.json 형식의 근무 패턴 파일을 선택해야 합니다.',
      );
    }
    if (asset.size !== undefined && asset.size > MAX_SHIFT_PATTERN_BYTES) {
      throw new ShiftPatternError('file-too-large', '근무 패턴 파일은 256KB 이하여야 합니다.');
    }
    const fileInfo = await FileSystem.getInfoAsync(asset.uri).catch(() => null);
    if (!fileInfo?.exists || typeof fileInfo.size !== 'number') {
      throw new ShiftPatternError('invalid-response', '선택한 패턴 파일의 크기를 확인할 수 없습니다.');
    }
    if (fileInfo.size > MAX_SHIFT_PATTERN_BYTES) {
      throw new ShiftPatternError('file-too-large', '근무 패턴 파일은 256KB 이하여야 합니다.');
    }
    const contents = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    assertShiftPatternByteSize(contents);
    return { fileName: asset.name, contents };
  } finally {
    await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined);
  }
}

export async function pickAndValidateShiftPatternFile() {
  const picked = await pickShiftPatternFile();
  if (!picked) return null;
  return {
    ...picked,
    pattern: parseAndValidateShiftPattern(picked.contents),
  };
}

export async function shareShiftPatternFile(
  contents: string,
): Promise<{ fileName: string; storageStatus: 'unconfirmed' }> {
  if (!FileSystem.cacheDirectory) {
    throw new ShiftPatternError('invalid-response', '근무 패턴 파일을 만들 저장 공간이 없습니다.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new ShiftPatternError('invalid-response', '이 휴대폰에서는 파일 공유를 사용할 수 없습니다.');
  }
  assertShiftPatternByteSize(contents);
  const pattern = parseAndValidateShiftPattern(contents);
  const fileName = createShiftPatternFileName(pattern.id);
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await cleanupPreviousPatternExports();
  await FileSystem.writeAsStringAsync(uri, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (!fileInfo?.exists || typeof fileInfo.size !== 'number') {
      throw new ShiftPatternError('invalid-response', '근무 패턴 파일의 크기를 확인할 수 없습니다.');
    }
    if (fileInfo.size > MAX_SHIFT_PATTERN_BYTES) {
      throw new ShiftPatternError('file-too-large', '근무 패턴 파일은 256KB 이하여야 합니다.');
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: '알람표 근무 패턴 공유',
      mimeType: 'application/json',
      UTI: 'public.json',
    });
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
  return { fileName, storageStatus: 'unconfirmed' };
}
