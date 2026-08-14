import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BRAND_ASSET_PATHS,
  buildBrandAssets,
  composeBrandFeatureGraphic,
  decodeBrandMaster,
  renderBrandWordmark,
} from '../brand-assets.mjs';
import {
  parseBrandAssetArguments,
  runBrandAssetGeneration,
} from '../generate-brand-assets.mjs';

describe('브랜드 파생 자산', () => {
  it('1024px 투명 순백 마스터를 단일 원본으로 사용해요', async () => {
    const [masterBytes, wordmarkFontBytes] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.master)),
      readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont)),
    ]);
    const master = decodeBrandMaster(masterBytes);

    expect(master).toMatchObject({ height: 1024, width: 1024 });
    expect(buildBrandAssets(masterBytes, wordmarkFontBytes).size).toBe(7);
  });

  it('적응형 전경과 단색 레이어가 같은 안전 영역 마크에서 파생돼요', async () => {
    const [masterBytes, wordmarkFontBytes] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.master)),
      readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont)),
    ]);
    const assets = buildBrandAssets(masterBytes, wordmarkFontBytes);
    const foreground = assets.get(BRAND_ASSET_PATHS.adaptiveForeground);

    expect(foreground).toEqual(assets.get(BRAND_ASSET_PATHS.adaptiveMonochrome));
    expect(assets.get(BRAND_ASSET_PATHS.favicon)).toBeInstanceOf(Buffer);
    expect(assets.get(BRAND_ASSET_PATHS.splash)).toBeInstanceOf(Buffer);
  });

  it('Wanted Sans 실제 글리프로 대표 그래픽 오른쪽 워드마크를 렌더링해요', async () => {
    const fontBytes = await readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont));
    const wordmark = renderBrandWordmark(fontBytes);
    let visible = 0;
    let minX = wordmark.width;
    let maxX = -1;
    let minY = wordmark.height;
    let maxY = -1;

    for (let offset = 0; offset < wordmark.pixels.length; offset += 4) {
      if (wordmark.pixels[offset + 3] === 0) continue;
      const index = offset / 4;
      const x = index % wordmark.width;
      const y = Math.floor(index / wordmark.width);
      visible += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    expect(visible).toBeGreaterThan(15_000);
    expect({ minX, maxX, minY, maxY }).toEqual({
      minX: 563,
      maxX: 929,
      minY: 189,
      maxY: 317,
    });
  });

  it('대표 그래픽의 왼쪽 마크와 오른쪽 워드마크를 분리해 배치해요', async () => {
    const [masterBytes, fontBytes] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.master)),
      readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont)),
    ]);
    const graphic = composeBrandFeatureGraphic(decodeBrandMaster(masterBytes), fontBytes);
    const countWhitePixels = (startX, endX) => {
      let count = 0;
      for (let y = 0; y < graphic.height; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * graphic.width + x) * 3;
          if (
            graphic.pixels[offset] > 240
            && graphic.pixels[offset + 1] > 240
            && graphic.pixels[offset + 2] > 240
          ) {
            count += 1;
          }
        }
      }
      return count;
    };

    expect(graphic).toMatchObject({ colorType: 2, height: 500, width: 1024 });
    expect(countWhitePixels(0, 500)).toBeGreaterThan(25_000);
    expect(countWhitePixels(550, 1024)).toBeGreaterThan(15_000);
    expect(countWhitePixels(480, 540)).toBe(0);
  });

  it('커밋된 파생 PNG가 현재 마스터와 일치해요', async () => {
    await expect(runBrandAssetGeneration(['--check'])).resolves.toBeInstanceOf(Map);
  });

  it('생성과 검사 모드를 명시적으로 구분해요', () => {
    expect(parseBrandAssetArguments(['--write'])).toEqual({ check: false });
    expect(parseBrandAssetArguments(['--check'])).toEqual({ check: true });
    expect(() => parseBrandAssetArguments([])).toThrow('사용법');
    expect(() => parseBrandAssetArguments(['--force'])).toThrow('사용법');
  });
});
