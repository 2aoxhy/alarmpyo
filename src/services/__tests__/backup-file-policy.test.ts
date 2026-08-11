import { describe, expect, it } from 'vitest';

import { addDays } from '../../utils/date';
import { getUtf8ByteLength } from '../../utils/utf8';
import { createDefaultAppData, exportAppDataToJson, previewAppDataImport } from '../app-data-service';
import {
  assertAppDataByteSize,
  assertBackupFileByteSize,
  assertBackupImportFileByteSize,
  assertEncryptedBackupFileByteSize,
  getCheckedBackupContentsByteSize,
  getCheckedEncryptedBackupContentsByteSize,
  MAX_APP_DATA_BYTES,
  MAX_BACKUP_FILE_BYTES,
  MAX_BACKUP_IMPORT_FILE_BYTES,
  MAX_ENCRYPTED_BACKUP_FILE_BYTES,
} from '../backup-file-policy';

describe('백업 파일 크기 정책', () => {
  it('앱 저장 본문과 일반 백업은 같은 4MB 계약을 사용해요', () => {
    expect(MAX_APP_DATA_BYTES).toBe(MAX_BACKUP_FILE_BYTES);
    expect(() => assertAppDataByteSize(MAX_APP_DATA_BYTES)).not.toThrow();
    expect(() => assertAppDataByteSize(MAX_APP_DATA_BYTES + 1)).toThrow(
      '근무표 데이터는 4MB 이하여야 해요',
    );
  });

  it('UTF-8 실제 바이트 수로 한글과 이모지를 계산합니다', () => {
    expect(getUtf8ByteLength('AlarmPyo')).toBe(8);
    expect(getUtf8ByteLength('한')).toBe(3);
    expect(getUtf8ByteLength('🌙')).toBe(4);
    expect(getUtf8ByteLength('AlarmPyo 한🌙')).toBe(16);
  });

  it('4MB까지 허용하고 한 바이트라도 넘으면 명확히 거부합니다', () => {
    expect(getCheckedBackupContentsByteSize('a'.repeat(MAX_BACKUP_FILE_BYTES))).toBe(
      MAX_BACKUP_FILE_BYTES,
    );
    expect(() =>
      getCheckedBackupContentsByteSize('a'.repeat(MAX_BACKUP_FILE_BYTES + 1)),
    ).toThrow('백업 파일은 4MB 이하여야 해요');
    expect(() => assertBackupFileByteSize(MAX_BACKUP_FILE_BYTES + 1)).toThrow(
      '백업 파일은 4MB 이하여야 해요',
    );
  });

  it('기존 1MB보다 큰 앱 백업도 내보내기와 가져오기를 왕복합니다', () => {
    const data = createDefaultAppData('2026-07-13');
    for (let offset = 0; offset < 5; offset += 1) {
      data.notes[addDays('2026-07-13', offset)] = '근'.repeat(90_000);
    }

    const backup = exportAppDataToJson(data, new Date('2026-07-13T01:02:03.000Z'));
    const byteSize = getCheckedBackupContentsByteSize(backup);
    const preview = previewAppDataImport(backup);

    expect(byteSize).toBeGreaterThan(1024 * 1024);
    expect(byteSize).toBeLessThanOrEqual(MAX_BACKUP_FILE_BYTES);
    expect(preview.data.notes).toEqual(data.notes);
  });

  it('Base64 인증 태그를 포함하는 암호화 파일은 별도 6MB 제한을 적용해요', () => {
    expect(
      getCheckedEncryptedBackupContentsByteSize(
        'a'.repeat(MAX_ENCRYPTED_BACKUP_FILE_BYTES),
      ),
    ).toBe(MAX_ENCRYPTED_BACKUP_FILE_BYTES);
    expect(() =>
      assertEncryptedBackupFileByteSize(MAX_ENCRYPTED_BACKUP_FILE_BYTES + 1),
    ).toThrow('암호화 백업 파일은 6MB 이하여야 해요');
  });

  it('형식을 확인하기 전에는 6MB를 절대 상한으로 적용해요', () => {
    expect(() => assertBackupImportFileByteSize(MAX_BACKUP_IMPORT_FILE_BYTES)).not.toThrow();
    expect(() =>
      assertBackupImportFileByteSize(MAX_BACKUP_IMPORT_FILE_BYTES + 1),
    ).toThrow('가져올 백업 파일은 6MB 이하여야 해요');
  });
});
