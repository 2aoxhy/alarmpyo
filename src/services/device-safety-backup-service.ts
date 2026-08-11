import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { AppData } from '../models/app-data';

import {
  exportAppDataToJson,
  previewAppDataImport,
} from './app-data-service';
import { getCheckedBackupContentsByteSize } from './backup-file-policy';
import {
  selectNewestDeviceSafetyBackup,
  type DeviceSafetyBackup,
} from './device-safety-backup-policy';

export type { DeviceSafetyBackup } from './device-safety-backup-policy';

const BACKUP_DIRECTORY_NAME = 'alarmpyo-safety-backups';
const LATEST_BACKUP_FILE_NAME = 'latest.alarmpyo-backup.json';
const PREVIOUS_BACKUP_FILE_NAME = 'previous.alarmpyo-backup.json';
const TEMP_BACKUP_FILE_NAME = 'pending.alarmpyo-backup.json';

function getBackupDirectory(): Directory {
  return new Directory(Paths.document, BACKUP_DIRECTORY_NAME);
}

function getBackupFile(name: string): File {
  return new File(getBackupDirectory(), name);
}

async function readValidatedBackup(
  file: File,
  source: DeviceSafetyBackup['source'],
): Promise<DeviceSafetyBackup | null> {
  if (!file.exists) return null;
  try {
    const preview = previewAppDataImport(await file.text());
    return {
      data: preview.data,
      exportedAt: preview.exportedAt,
      source,
    };
  } catch {
    return null;
  }
}

/**
 * AsyncStorage와 다른 앱 문서 파일에 최신 정상본과 직전 정상본을 교대로 저장해요.
 * 웹에서는 별도 파일 백업을 만들지 않아요.
 */
export async function writeDeviceSafetyBackup(
  data: AppData,
  now: Date = new Date(),
): Promise<boolean> {
  // 웹 미리보기에서는 파일 시스템이 보장되지 않으므로 내부 저장만 성공으로 봐요.
  if (Platform.OS === 'web') return true;

  const directory = getBackupDirectory();
  const latest = getBackupFile(LATEST_BACKUP_FILE_NAME);
  const previous = getBackupFile(PREVIOUS_BACKUP_FILE_NAME);
  const pending = getBackupFile(TEMP_BACKUP_FILE_NAME);
  directory.create({ idempotent: true, intermediates: true });

  if (pending.exists) pending.delete();
  pending.create({ overwrite: true, intermediates: true });
  const contents = exportAppDataToJson(data, now, { pretty: false });
  getCheckedBackupContentsByteSize(contents);
  pending.write(contents);

  // 새 파일을 완성한 뒤에만 기존 정상본을 한 단계 뒤로 이동해요.
  if (latest.exists) {
    await latest.copy(previous, { overwrite: true });
  }
  await pending.move(latest, { overwrite: true });
  return true;
}

/** 중단된 쓰기 파일까지 검증하고 가장 최근 정상 백업을 선택해요. */
export async function readDeviceSafetyBackup(): Promise<DeviceSafetyBackup | null> {
  if (Platform.OS === 'web') return null;

  return selectNewestDeviceSafetyBackup(
    await Promise.all([
      readValidatedBackup(getBackupFile(TEMP_BACKUP_FILE_NAME), 'pending'),
      readValidatedBackup(getBackupFile(LATEST_BACKUP_FILE_NAME), 'latest'),
      readValidatedBackup(getBackupFile(PREVIOUS_BACKUP_FILE_NAME), 'previous'),
    ]),
  );
}
