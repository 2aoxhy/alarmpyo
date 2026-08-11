import * as DocumentPicker from 'expo-document-picker';

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
  /** 다운로드 시작 뒤 실제 저장 완료 여부는 브라우저에서 확인할 수 없어요. */
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

export async function exportBackupFile(
  contents: string,
  options: BackupFileExportOptions = {},
): Promise<BackupFileExportResult> {
  if (typeof document === 'undefined') {
    throw new Error('이 환경에서는 백업 파일을 저장할 수 없어요.');
  }

  const encrypted = options.encrypted === true;
  const expectedByteSize = encrypted
    ? getCheckedEncryptedBackupContentsByteSize(contents)
    : getCheckedBackupContentsByteSize(contents);
  const fileName = createBackupFileName(encrypted);
  const blob = new Blob([contents], {
    type: encrypted ? 'application/octet-stream' : 'application/json;charset=utf-8',
  });
  if (encrypted) {
    assertEncryptedBackupFileByteSize(blob.size);
  } else {
    assertBackupFileByteSize(blob.size);
  }
  if (blob.size !== expectedByteSize) {
    throw new Error('백업 파일을 정확히 만들지 못했어요. 다시 시도해 주세요.');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Safari와 Firefox가 다운로드를 시작할 때까지 객체 URL을 유지해요.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { fileName, storageStatus: 'unconfirmed' };
}

export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({
    base64: false,
    multiple: false,
    type: ['application/json', 'application/octet-stream', 'text/json', 'text/plain'],
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) throw new Error('선택한 파일을 읽을 수 없어요.');
  let encryptedContents = false;
  try {
    if (asset.size !== undefined) {
      assertBackupImportFileByteSize(asset.size);
    }
    if (asset.file) {
      assertBackupImportFileByteSize(asset.file.size);
    }

    let contents: string;
    let actualByteSize: number;
    if (asset.file) {
      actualByteSize = asset.file.size;
      contents = await asset.file.text();
    } else {
      const blob = await (await fetch(asset.uri)).blob();
      // 텍스트로 디코딩하기 전에 실제 Blob 크기에 6MB 절대 상한을 적용해요.
      assertBackupImportFileByteSize(blob.size);
      actualByteSize = blob.size;
      contents = await blob.text();
    }
    encryptedContents = hasEncryptedBackupEnvelope(contents);
    const decodedByteSize = encryptedContents
      ? getCheckedEncryptedBackupContentsByteSize(contents)
      : getCheckedBackupContentsByteSize(contents);
    if (decodedByteSize !== actualByteSize) {
      throw new Error('백업 파일의 UTF-8 내용을 정확히 읽지 못했어요.');
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
  }
}
