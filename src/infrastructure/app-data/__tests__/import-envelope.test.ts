import { describe, expect, it } from 'vitest';

import {
  APP_DATA_BACKUP_FORMAT,
  APP_DATA_BACKUP_FORMAT_VERSION,
  LEGACY_APP_DATA_BACKUP_FORMAT,
  parseAppDataImportEnvelope,
} from '../import-envelope';

describe('앱 데이터 가져오기 봉투', () => {
  it('봉투가 없는 기존 데이터를 원문으로 유지해요', () => {
    const data = { version: 2, pattern: {} };

    expect(parseAppDataImportEnvelope(data)).toEqual({
      data,
      exportedAt: null,
      source: 'data',
    });
    expect(parseAppDataImportEnvelope(null)).toEqual({
      data: null,
      exportedAt: null,
      source: 'data',
    });
  });

  it('지원하는 백업 봉투의 원문과 생성일을 보존해요', () => {
    const data = { version: 18 };

    expect(
      parseAppDataImportEnvelope({
        format: APP_DATA_BACKUP_FORMAT,
        formatVersion: APP_DATA_BACKUP_FORMAT_VERSION,
        exportedAt: '2026-08-09T00:00:00.000Z',
        data,
      }),
    ).toEqual({
      data,
      exportedAt: '2026-08-09T00:00:00.000Z',
      source: 'backup',
    });
  });

  it('과거 앱 백업 봉투는 가져오기 입력으로만 받아요', () => {
    const data = { version: 18 };

    expect(
      parseAppDataImportEnvelope({
        format: LEGACY_APP_DATA_BACKUP_FORMAT,
        formatVersion: APP_DATA_BACKUP_FORMAT_VERSION,
        exportedAt: '2026-08-09T00:00:00.000Z',
        data,
      }),
    ).toEqual({
      data,
      exportedAt: '2026-08-09T00:00:00.000Z',
      source: 'backup',
    });
    expect(APP_DATA_BACKUP_FORMAT).toBe('alarmpyo-backup');
  });

  it('지원하지 않는 형식과 잘못된 생성일의 기존 오류 문구를 유지해요', () => {
    expect(() =>
      parseAppDataImportEnvelope({
        format: 'unknown',
        formatVersion: 1,
      }),
    ).toThrow('지원하지 않는 백업 파일 형식이에요.');
    expect(() =>
      parseAppDataImportEnvelope({
        format: APP_DATA_BACKUP_FORMAT,
        formatVersion: APP_DATA_BACKUP_FORMAT_VERSION,
        exportedAt: '잘못된 날짜',
        data: {},
      }),
    ).toThrow('백업 생성일 날짜가 올바르지 않아요.');
  });
});
