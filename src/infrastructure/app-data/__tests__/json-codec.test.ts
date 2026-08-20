import { describe, expect, it } from 'vitest';

import {
  canonicalizeAppData,
  createDefaultAppData,
  exportAppDataToJson,
  previewAppDataImport,
  serializeAppData,
  validateAndMigrateAppData,
} from '../../../services/app-data-service';
import { createAppDataJsonCodec } from '../json-codec';

const codec = createAppDataJsonCodec<number>({
  assertAppDataJsonByteSize: () => undefined,
  assertBackupJsonByteSize: () => undefined,
  canonicalizeAppData,
  validateAndMigrateAppData,
});

describe('AppData JSON codec facade parity', () => {
  it('canonical 저장과 compact·pretty 백업을 기존 facade와 동일하게 만듭니다', () => {
    const data = createDefaultAppData('2026-08-21');
    data.notes['2026-08-22'] = '보존할 메모';
    const now = new Date('2026-08-21T00:00:00.000Z');

    expect(codec.serializeAppData(data)).toBe(serializeAppData(data));
    expect(codec.exportAppDataToJson(data, now)).toBe(
      exportAppDataToJson(data, now),
    );
    expect(codec.exportAppDataToJson(data, now, { pretty: false })).toBe(
      exportAppDataToJson(data, now, { pretty: false }),
    );
  });

  it('가져오기 미리보기와 재직렬화 결과를 동일하게 보존합니다', () => {
    const data = createDefaultAppData('2026-08-21');
    data.overrides['2026-08-22'] = 'night';
    const backup = exportAppDataToJson(
      data,
      new Date('2026-08-21T00:00:00.000Z'),
      { pretty: false },
    );

    const direct = codec.previewAppDataImport(backup);
    const facade = previewAppDataImport(backup);

    expect(direct).toEqual(facade);
    expect(codec.serializeAppData(direct.data)).toBe(
      serializeAppData(facade.data),
    );
  });

  it('본문과 백업의 JSON 오류 문구를 구분합니다', () => {
    expect(codec.tryParseAppDataJson('{broken')).toMatchObject({
      ok: false,
      error: {
        message: '근무표 데이터의 JSON 형식이 올바르지 않습니다.',
      },
    });
    expect(() => codec.previewAppDataImport('{broken')).toThrow(
      '백업 파일의 JSON 형식이 올바르지 않습니다.',
    );
  });
});
