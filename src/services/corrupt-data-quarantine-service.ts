import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const QUARANTINE_DIRECTORY_NAME = 'alarmpyo-recovery';
const LATEST_QUARANTINE_FILE_NAME = 'corrupt-app-data-latest.json';
const PREVIOUS_QUARANTINE_FILE_NAME = 'corrupt-app-data-previous.json';
const PENDING_QUARANTINE_FILE_NAME = 'corrupt-app-data-pending.json';

function getQuarantineDirectory(): Directory {
  return new Directory(Paths.document, QUARANTINE_DIRECTORY_NAME);
}

function getQuarantineFile(name: string): File {
  return new File(getQuarantineDirectory(), name);
}

/**
 * AsyncStorage가 가득 찼거나 손상된 상황에서도 원본을 잃지 않도록
 * 앱 문서 영역의 독립 파일 두 세대에 손상 원본을 보관해요.
 */
export async function quarantineCorruptAppData(
  raw: string,
  _now: Date = new Date(),
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const directory = getQuarantineDirectory();
  const latest = getQuarantineFile(LATEST_QUARANTINE_FILE_NAME);
  const previous = getQuarantineFile(PREVIOUS_QUARANTINE_FILE_NAME);
  const pending = getQuarantineFile(PENDING_QUARANTINE_FILE_NAME);

  try {
    directory.create({ idempotent: true, intermediates: true });
    if (pending.exists) pending.delete();
    pending.create({ overwrite: true, intermediates: true });
    pending.write(raw);

    if (latest.exists) {
      await latest.copy(previous, { overwrite: true });
    }
    await pending.move(latest, { overwrite: true });
    return `device-file:${QUARANTINE_DIRECTORY_NAME}/${LATEST_QUARANTINE_FILE_NAME}`;
  } catch {
    if (pending.exists) pending.delete();
    return null;
  }
}
