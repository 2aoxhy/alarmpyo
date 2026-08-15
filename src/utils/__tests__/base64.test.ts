import { describe, expect, it } from 'vitest';

import { base64ToBytes, bytesToBase64, getBase64DecodedByteLength } from '../base64';

describe('백업 Base64 변환', () => {
  it('표준 테스트 벡터와 UTF-8 바이트를 손실 없이 왕복해요', () => {
    const bytes = new TextEncoder().encode('ALARMPYO 암호화 백업');
    const encoded = bytesToBase64(bytes);

    expect(bytesToBase64(Uint8Array.from([102, 111, 111, 98, 97, 114]))).toBe(
      'Zm9vYmFy',
    );
    expect(base64ToBytes(encoded)).toEqual(bytes);
    expect(getBase64DecodedByteLength(encoded)).toBe(bytes.length);
  });

  it('비표준 형식과 제한을 넘는 디코딩을 거절해요', () => {
    expect(() => base64ToBytes('%%%')).toThrow('Base64 형식이 올바르지 않습니다.');
    expect(() => base64ToBytes('Zh==')).toThrow('Base64 형식이 올바르지 않습니다.');
    expect(() => base64ToBytes('Zm9v', 2)).toThrow(
      'Base64 데이터가 허용된 크기를 넘었습니다.',
    );
  });
});
