import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { MAX_WORK_SETTINGS_SHARE_BYTES } from './work-settings-share-service';

function createWorkSettingsFileName(now = new Date()) {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `AlarmPyo-근무설정-${stamp}.json`;
}

async function cleanupPreviousWorkSettingsExports() {
  if (!FileSystem.cacheDirectory) return;
  const fileNames = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory).catch(() => []);
  await Promise.all(
    fileNames
      .filter((fileName) => /^AlarmPyo-근무설정-\d{4}-\d{2}-\d{2}\.json$/.test(fileName))
      .map((fileName) =>
        FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${fileName}`, {
          idempotent: true,
        }).catch(() => undefined),
      ),
  );
}

export async function shareWorkSettingsFile(contents: string) {
  if (!FileSystem.cacheDirectory) {
    throw new Error('근무 설정 파일을 만들 수 있는 저장 공간이 없어요.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('이 휴대폰에서는 파일 공유를 사용할 수 없어요.');
  }

  await cleanupPreviousWorkSettingsExports();
  const fileName = createWorkSettingsFileName();
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || typeof fileInfo.size !== 'number' || fileInfo.size > MAX_WORK_SETTINGS_SHARE_BYTES) {
      throw new Error('근무 설정 파일은 256KB 이하여야 해요.');
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: '알람표 근무 설정 공유',
      mimeType: 'application/json',
      UTI: 'public.json',
    });
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
  return fileName;
}

export async function pickWorkSettingsFile() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/json', 'text/json', 'text/plain'],
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) throw new Error('선택한 파일을 읽을 수 없어요.');
  try {
    if (asset.size !== undefined && asset.size > MAX_WORK_SETTINGS_SHARE_BYTES) {
      throw new Error('근무 설정 파일은 256KB 이하여야 해요.');
    }
    const fileInfo = await FileSystem.getInfoAsync(asset.uri).catch(() => null);
    if (!fileInfo?.exists || typeof fileInfo.size !== 'number') {
      throw new Error('선택한 파일의 크기를 확인할 수 없어요.');
    }
    if (fileInfo.size > MAX_WORK_SETTINGS_SHARE_BYTES) {
      throw new Error('근무 설정 파일은 256KB 이하여야 해요.');
    }
    return {
      fileName: asset.name,
      contents: await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      }),
    };
  } finally {
    await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined);
  }
}
