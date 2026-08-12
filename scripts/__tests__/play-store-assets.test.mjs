import { Buffer } from 'node:buffer';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  findDuplicatePhoneScreenshotPaths,
  inspectPlayStoreImage,
  PLAY_STORE_ASSET_PATHS,
  validateOpaquePlayImageMetadata,
  validatePhoneScreenshotMetadata,
  validatePlayStoreAssets,
} from '../play-store-assets.mjs';
import { parsePlayStoreAssetArguments } from '../validate-play-store-assets.mjs';

const root = process.cwd();

function screenshotMetadata(overrides = {}) {
  return {
    bitDepth: 8,
    colorComponents: 3,
    colorType: 2,
    format: 'png',
    hasAlpha: false,
    height: 1920,
    interlace: 0,
    width: 1080,
    ...overrides,
  };
}

function corruptFirstPngDataChunk(bytes) {
  const copy = Buffer.from(bytes);
  let offset = 8;
  while (offset + 12 <= copy.length) {
    const length = copy.readUInt32BE(offset);
    const type = copy.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') {
      copy[offset + 8] ^= 0xff;
      return copy;
    }
    offset += 12 + length;
  }
  throw new Error('테스트 PNG에 IDAT 청크가 없어요.');
}

function jpegWithStructureButNoDecodableTables() {
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, // SOF0
    0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x00, 0x03,
    0x00, 0x00, 0x3f, 0x00, // SOS
    0x00, // 실제 디코더에 필요한 DQT/DHT가 없는 엔트로피 자리
    0xff, 0xd9, // EOI
  ]);
}

describe('Google Play 등록 이미지', () => {
  it('현재 PNG 아이콘과 대표 그래픽의 CRC·압축 데이터·크기·색상 계약을 확인해요', async () => {
    const result = await validatePlayStoreAssets({
      requirePhoneScreenshots: false,
      root,
    });

    expect(result.errors).toEqual([]);
    expect(result.assets.icon).toMatchObject({
      bitDepth: 8,
      colorType: 6,
      format: 'png',
      hasSrgbProfile: true,
      height: 512,
      pixelDataDecoded: true,
      validationScope: 'png-crc-and-compressed-pixel-data',
      width: 512,
    });
    expect(result.assets.icon.byteLength).toBeLessThanOrEqual(1024 * 1024);
    expect(result.assets.featureGraphic).toMatchObject({
      bitDepth: 8,
      colorType: 2,
      format: 'png',
      hasAlpha: false,
      height: 500,
      pixelDataDecoded: true,
      width: 1024,
    });
    expect(result.warnings).toContain(
      '휴대전화 스크린샷이 아직 없어요. Play 게시 전에 최소 2장을 추가해야 해요.',
    );
  });

  it('실제 게시 검사는 휴대전화 스크린샷이 2장 미만이면 차단해요', async () => {
    const result = await validatePlayStoreAssets({ root });

    expect(result.errors).toContain(
      '휴대전화 스크린샷이 0장이에요. Play 게시에는 최소 2장이 필요해요.',
    );
  });

  it('같은 파일을 이름만 바꿔 최소 스크린샷 수를 채우지 못하게 해요', () => {
    expect(
      findDuplicatePhoneScreenshotPaths([
        { path: '01-today.png', sha256: 'a'.repeat(64) },
        { path: '02-calendar.png', sha256: 'b'.repeat(64) },
        { path: '03-copy.png', sha256: 'a'.repeat(64) },
      ]),
    ).toEqual([['01-today.png', '03-copy.png']]);
  });

  it('스크린샷의 허용 크기·비율·불투명 형식을 경계값까지 검사해요', () => {
    expect(
      validatePhoneScreenshotMetadata(
        screenshotMetadata({ height: 640, width: 320 }),
      ),
    ).toBe(true);
    expect(
      validatePhoneScreenshotMetadata(
        screenshotMetadata({ format: 'jpeg', height: 3840, width: 1920 }),
      ),
    ).toBe(true);

    expect(() =>
      validatePhoneScreenshotMetadata(
        screenshotMetadata({ height: 640, width: 319 }),
      ),
    ).toThrow('짧은 변은 320px 이상');
    expect(() =>
      validatePhoneScreenshotMetadata(
        screenshotMetadata({ height: 641, width: 320 }),
      ),
    ).toThrow('긴 변은 짧은 변의 두 배');
    expect(() =>
      validatePhoneScreenshotMetadata(
        screenshotMetadata({ height: 3841, width: 1921 }),
      ),
    ).toThrow('긴 변은 3840px 이하');
    expect(() =>
      validatePhoneScreenshotMetadata(
        screenshotMetadata({ colorType: 6, hasAlpha: true }),
      ),
    ).toThrow('24비트 RGB PNG');
    expect(() =>
      validatePhoneScreenshotMetadata(screenshotMetadata({ interlace: 1 })),
    ).toThrow('로컬 등록 계약에서 비인터레이스 PNG만 허용');
  });

  it('JPEG 대표 그래픽과 스크린샷은 8비트 RGB 3채널만 허용해요', () => {
    const validJpeg = screenshotMetadata({ format: 'jpeg' });
    expect(validatePhoneScreenshotMetadata(validJpeg)).toBe(true);
    expect(
      validateOpaquePlayImageMetadata(validJpeg, 'Play 대표 그래픽'),
    ).toBe(true);

    for (const invalid of [
      screenshotMetadata({ colorComponents: 1, format: 'jpeg' }),
      screenshotMetadata({ colorComponents: 4, format: 'jpeg' }),
      screenshotMetadata({ bitDepth: 12, format: 'jpeg' }),
    ]) {
      expect(() => validatePhoneScreenshotMetadata(invalid)).toThrow(
        '채널당 8비트 RGB 3채널만 허용',
      );
      expect(() =>
        validateOpaquePlayImageMetadata(invalid, 'Play 대표 그래픽'),
      ).toThrow('채널당 8비트 RGB 3채널만 허용');
    }
  });

  it('확장자만 PNG인 손상 이미지를 CRC 검사에서 거부해요', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'alarmpyo-play-assets-'));
    const damagedPath = join(temporaryRoot, 'damaged.png');
    try {
      const featurePath = resolve(root, PLAY_STORE_ASSET_PATHS.featureGraphic);
      writeFileSync(
        damagedPath,
        corruptFirstPngDataChunk(readFileSync(featurePath)),
      );

      await expect(inspectPlayStoreImage(damagedPath)).rejects.toThrow('CRC가 손상');
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('JPEG 검사는 엔트로피 디코딩이 아닌 구조·크기·RGB 메타데이터 검사임을 고정해요', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'alarmpyo-play-jpeg-'));
    const jpegPath = join(temporaryRoot, 'structure-only.jpg');
    try {
      writeFileSync(jpegPath, jpegWithStructureButNoDecodableTables());

      const inspected = await inspectPlayStoreImage(jpegPath);
      expect(inspected).toMatchObject({
        bitDepth: 8,
        colorComponents: 3,
        format: 'jpeg',
        height: 1,
        pixelDataDecoded: false,
        validationScope: 'jpeg-structure-and-metadata',
        width: 1,
      });
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('임시 감사 옵션과 실제 게시용 엄격 검사를 명시적으로 분리해요', () => {
    expect(parsePlayStoreAssetArguments([])).toEqual({
      requirePhoneScreenshots: true,
    });
    expect(
      parsePlayStoreAssetArguments(['--allow-missing-screenshots']),
    ).toEqual({ requirePhoneScreenshots: false });
    expect(() => parsePlayStoreAssetArguments(['--skip-image-checks'])).toThrow(
      '지원하지 않는 인자',
    );
  });

  it('등록 문서와 package 명령이 같은 엄격 검사 경로를 안내해요', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    );
    const listing = readFileSync(
      resolve(root, 'docs/google-play-listing-ko.md'),
      'utf8',
    );

    expect(packageJson.scripts['release:verify:play-store-assets']).toBe(
      'node scripts/validate-play-store-assets.mjs',
    );
    expect(listing).toContain('npm run release:verify:play-store-assets');
    expect(listing).toContain(
      'https://support.google.com/googleplay/android-developer/answer/9866151?hl=ko',
    );
    expect(listing).toContain(
      'JPEG는 마커 구조·크기·채널당 8비트 RGB 3채널 메타데이터만 검사하며 엔트로피 픽셀을 디코딩하지 않아요.',
    );

    const appName = listing.match(/^- 앱 이름: `([^`]+)`$/m)?.[1];
    const shortDescription = listing
      .match(/## 짧은 설명\s+([\s\S]*?)\s+## 전체 설명/)?.[1]
      ?.trim();
    const fullDescription = listing
      .match(/## 전체 설명\s+([\s\S]*?)\s+## 그래픽 자료/)?.[1]
      ?.trim();
    expect(appName).toBe('알람표');
    expect(appName.length).toBeLessThanOrEqual(30);
    expect(shortDescription.length).toBeLessThanOrEqual(80);
    expect(fullDescription.length).toBeLessThanOrEqual(4000);
  });
});
