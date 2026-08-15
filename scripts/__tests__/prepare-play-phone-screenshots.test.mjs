import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  convertWebpToOpaquePng,
  parsePlayPhoneScreenshotArguments,
} from '../prepare-play-phone-screenshots.mjs';
import {
  inspectPlayStoreImage,
  validatePhoneScreenshotMetadata,
} from '../play-store-assets.mjs';

describe('Play 휴대전화 스크린샷 준비', () => {
  it('같은 WebP 원본을 결정적인 불투명 RGB PNG로 바꿔요', async () => {
    const directory = await mkdtemp(
      resolve(tmpdir(), 'alarmpyo-play-screenshot-conversion-'),
    );
    const inputPath = resolve(directory, 'source.webp');
    const outputPath = resolve(directory, 'output.png');
    try {
      await sharp({
        create: {
          width: 32,
          height: 64,
          channels: 4,
          background: { r: 16, g: 18, b: 20, alpha: 0.7 },
        },
      })
        .webp({ lossless: true })
        .toFile(inputPath);

      const first = await convertWebpToOpaquePng({
        expectedHeight: 64,
        expectedWidth: 32,
        inputPath,
      });
      const second = await convertWebpToOpaquePng({
        expectedHeight: 64,
        expectedWidth: 32,
        inputPath,
      });
      expect(first.equals(second)).toBe(true);

      await writeFile(outputPath, first);
      const metadata = await inspectPlayStoreImage(outputPath);
      expect(metadata).toMatchObject({
        bitDepth: 8,
        colorType: 2,
        format: 'png',
        hasAlpha: false,
        height: 64,
        interlace: 0,
        width: 32,
      });
      expect(() =>
        validatePhoneScreenshotMetadata(metadata),
      ).toThrow('짧은 변은 320px 이상');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('더 긴 원본을 자르거나 왜곡하지 않고 브랜드 배경 안에 맞춰요', async () => {
    const directory = await mkdtemp(
      resolve(tmpdir(), 'alarmpyo-play-screenshot-contain-'),
    );
    const inputPath = resolve(directory, 'source.webp');
    try {
      await sharp({
        create: {
          width: 40,
          height: 100,
          channels: 3,
          background: { r: 250, g: 250, b: 251 },
        },
      })
        .webp({ lossless: true })
        .toFile(inputPath);

      const output = await convertWebpToOpaquePng({
        expectedHeight: 64,
        expectedWidth: 32,
        inputPath,
      });
      const { data, info } = await sharp(output)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const pixelAt = (x, y) => {
        const offset = (y * info.width + x) * info.channels;
        return [...data.subarray(offset, offset + 3)];
      };

      expect(info).toMatchObject({ channels: 3, height: 64, width: 32 });
      expect(pixelAt(0, 32)).toEqual([16, 18, 20]);
      expect(pixelAt(16, 32)).toEqual([250, 250, 251]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('실기기 목표보다 작은 원본을 확대하지 않아요', async () => {
    const directory = await mkdtemp(
      resolve(tmpdir(), 'alarmpyo-play-screenshot-size-'),
    );
    const inputPath = resolve(directory, 'source.webp');
    try {
      await sharp({
        create: {
          width: 32,
          height: 64,
          channels: 3,
          background: { r: 16, g: 18, b: 20 },
        },
      })
        .webp({ lossless: true })
        .toFile(inputPath);
      await expect(
        convertWebpToOpaquePng({
          expectedHeight: 1920,
          expectedWidth: 1080,
          inputPath,
        }),
      ).rejects.toThrow('작은 원본을 확대하지 않아요');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('재촬영 원본 폴더를 명시적으로 요구해요', () => {
    expect(() => parsePlayPhoneScreenshotArguments([])).toThrow('--source-dir');
    expect(
      parsePlayPhoneScreenshotArguments(['--source-dir', '.release/captures']),
    ).toEqual({ sourceDirectory: resolve('.release/captures') });
    expect(() =>
      parsePlayPhoneScreenshotArguments(['--resize']),
    ).toThrow('지원하지 않는 인자');
  });
});
