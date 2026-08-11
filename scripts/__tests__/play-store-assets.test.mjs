import { Buffer } from 'node:buffer';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readPngHeader(relativePath) {
  const path = resolve(process.cwd(), relativePath);
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {
    bitDepth: bytes[24],
    colorType: bytes[25],
    height: bytes.readUInt32BE(20),
    path,
    width: bytes.readUInt32BE(16),
  };
}

describe('Google Play 등록 이미지', () => {
  it('AlarmPyo 아이콘은 512 정사각형 32비트 PNG이며 업로드 상한보다 작아요', () => {
    const icon = readPngHeader('assets/play-store/alarmpyo-icon-512.png');

    expect(icon).toMatchObject({
      bitDepth: 8,
      colorType: 6,
      height: 512,
      width: 512,
    });
    expect(statSync(icon.path).size).toBeLessThanOrEqual(1024 * 1024);
  });

  it('AlarmPyo 대표 그래픽은 1024×500 24비트 불투명 PNG예요', () => {
    const feature = readPngHeader(
      'assets/play-store/alarmpyo-feature-graphic.png',
    );

    expect(feature).toMatchObject({
      bitDepth: 8,
      colorType: 2,
      height: 500,
      width: 1024,
    });
  });
});
