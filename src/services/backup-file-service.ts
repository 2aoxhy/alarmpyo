import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import {
  assertBackupFileByteSize,
  assertBackupImportFileByteSize,
  assertEncryptedBackupFileByteSize,
  ENCRYPTED_BACKUP_ACCESS_ERROR_MESSAGE,
  getCheckedBackupContentsByteSize,
  getCheckedEncryptedBackupContentsByteSize,
} from './backup-file-policy';
import { hasEncryptedBackupEnvelope } from './backup-file-format';

type BackupFileExportOptions = {
  encrypted?: boolean;
};

export type BackupFileExportResult = {
  fileName: string;
  /** 공유 화면이 닫혀도 실제 저장·전달 여부는 Expo Sharing에서 확인할 수 없어요. */
  storageStatus: 'unconfirmed';
};

function createBackupFileName(encrypted: boolean, now = new Date()) {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  return encrypted
    ? `AlarmPyo-암호화-백업-${stamp}-${time}.alarmpyo`
    : `AlarmPyo-백업-${stamp}-${time}.json`;
}

async function cleanupPreviousBackupExports() {
  if (!FileSystem.cacheDirectory) return;
  const fileNames = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory).catch(() => []);
  await Promise.all(
    fileNames
      .filter((protocolFile) =>
        /^AlarmPyo-(?:암호화-)?백업-\d{4}-\d{2}-\d{2}-\d{4}\.(?:json|alarmpyo)$/.test(
          protocolFile,
        ),
      )
      .map((protocolFile) =>
        FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${protocolFile}`, {
          idempotent: true,
        }).catch(() => undefined),
      ),
  );
}

export async function exportBackupFile(
  contents: string,
  options: BackupFileExportOptions = {},
): Promise<BackupFileExportResult> {
  if (!FileSystem.cacheDirectory) {
    throw new Error('백업 파일을 만들 수 있는 저장 공간이 없습니다.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('이 휴대폰에서는 파일 공유를 사용할 수 없습니다.');
  }

  const encrypted = options.encrypted === true;
  const expectedByteSize = encrypted
    ? getCheckedEncryptedBackupContentsByteSize(contents)
    : getCheckedBackupContentsByteSize(contents);

  await cleanupPreviousBackupExports();
  const fileName = createBackupFileName(encrypted);
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (!fileInfo?.exists || typeof fileInfo.size !== 'number') {
      throw new Error('만든 백업 파일의 크기를 확인할 수 없습니다.');
    }
    if (encrypted) {
      assertEncryptedBackupFileByteSize(fileInfo.size);
    } else {
      assertBackupFileByteSize(fileInfo.size);
    }
    if (fileInfo.size !== expectedByteSize) {
      throw new Error('백업 파일을 정확히 만들지 못했습니다. 다시 시도해야 합니다.');
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: encrypted ? '알람표 암호화 백업 파일 저장' : '알람표 백업 파일 저장',
      mimeType: encrypted ? 'application/octet-stream' : 'application/json',
      UTI: encrypted ? 'public.data' : 'public.json',
    });
  } catch (error) {
    // 공유 화면을 열지 못한 실패 파일만 즉시 지워요. 화면이 정상적으로 닫힌 뒤
    // 남은 캐시 파일은 저장 성공으로 간주하지 않고 다음 내보내기 때 정리해요.
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
  return { fileName, storageStatus: 'unconfirmed' };
}

export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/json', 'application/octet-stream', 'text/json', 'text/plain'],
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) throw new Error('선택한 파일을 읽을 수 없습니다.');
  let encryptedContents = false;
  try {
    if (asset.size !== undefined) {
      assertBackupImportFileByteSize(asset.size);
    }

    // 확장자나 문서 공급자의 형식 정보는 신뢰하지 않고 캐시의 실제 크기를 확인해요.
    const fileInfo = await FileSystem.getInfoAsync(asset.uri).catch(() => null);
    if (!fileInfo?.exists || typeof fileInfo.size !== 'number') {
      throw new Error('선택한 파일의 크기를 확인할 수 없습니다.');
    }
    // 내용을 읽기 전에는 6MB 절대 상한만 적용해 과도한 메모리 사용을 막아요.
    assertBackupImportFileByteSize(fileInfo.size);

    const contents = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    encryptedContents = hasEncryptedBackupEnvelope(contents);
    const decodedByteSize = encryptedContents
      ? getCheckedEncryptedBackupContentsByteSize(contents)
      : getCheckedBackupContentsByteSize(contents);
    if (decodedByteSize !== fileInfo.size) {
      throw new Error('백업 파일의 UTF-8 내용을 정확히 읽지 못했습니다.');
    }

    return {
      fileName: asset.name,
      contents,
      encrypted: encryptedContents,
    };
  } catch (error) {
    if (encryptedContents) {
      throw new Error(ENCRYPTED_BACKUP_ACCESS_ERROR_MESSAGE);
    }
    throw error;
  } finally {
    // 문서 선택기가 만든 캐시 복사본은 성공과 실패 모두에서 즉시 정리합니다.
    await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined);
  }
}
