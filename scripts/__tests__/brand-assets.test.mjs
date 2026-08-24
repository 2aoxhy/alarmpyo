import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

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

async function createTexturedMasterFixture({ centerCutout = false, extent = 758 } = {}) {
  const size = 1024;
  const pixels = Buffer.alloc(size * size * 4, 255);
  for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 0;
  const start = Math.floor((size - extent) / 2);
  const end = start + extent;
  for (let y = start; y < end; y += 1) {
    for (let x = start; x < end; x += 1) {
      const inCutout = centerCutout
        && x >= 462 && x < 562
        && y >= 462 && y < 562;
      if (!inCutout) pixels[(y * size + x) * 4 + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { channels: 4, height: size, width: size } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function expectExactLogoSymmetry(master) {
  const alphaAt = (index) => master.pixels[index * 4 + 3];
  const visibleAt = (index) => alphaAt(index) >= 8;
  const labels = new Int32Array(master.width * master.height);
  const queue = new Int32Array(labels.length);
  const components = [];
  let componentId = 0;
  for (let seed = 0; seed < labels.length; seed += 1) {
    if (labels[seed] !== 0 || !visibleAt(seed)) continue;
    componentId += 1;
    let head = 0;
    let tail = 0;
    let minX = master.width;
    let minY = master.height;
    let maxX = -1;
    let maxY = -1;
    const indexes = [];
    queue[tail] = seed;
    tail += 1;
    labels[seed] = componentId;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const y = Math.floor(index / master.width);
      const x = index - y * master.width;
      indexes.push(index);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const neighbor of [index - 1, index + 1, index - master.width, index + master.width]) {
        if (neighbor < 0 || neighbor >= labels.length || labels[neighbor] !== 0 || !visibleAt(neighbor)) continue;
        const neighborY = Math.floor(neighbor / master.width);
        const neighborX = neighbor - neighborY * master.width;
        if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) continue;
        labels[neighbor] = componentId;
        queue[tail] = neighbor;
        tail += 1;
      }
    }
    components.push({ bounds: { maxX, maxY, minX, minY }, id: componentId, indexes });
  }
  components.sort((left, right) => right.indexes.length - left.indexes.length);
  const arrows = components.slice(0, 2);
  const arrowIds = new Set(arrows.map(({ id }) => id));
  expect(arrows[0].indexes).toHaveLength(arrows[1].indexes.length);
  let arrowComponentMismatches = 0;
  let arrowAlphaMismatches = 0;
  for (const index of arrows[0].indexes) {
    const y = Math.floor(index / master.width);
    const x = index - y * master.width;
    const paired = (master.height - 1 - y) * master.width + (master.width - 1 - x);
    if (!arrowIds.has(labels[paired])) arrowComponentMismatches += 1;
    if (alphaAt(index) !== alphaAt(paired)) arrowAlphaMismatches += 1;
  }
  expect({ arrowAlphaMismatches, arrowComponentMismatches }).toEqual({
    arrowAlphaMismatches: 0,
    arrowComponentMismatches: 0,
  });
  const hand = components.find(({ bounds, indexes }) => (
    indexes.length < arrows[0].indexes.length
      && bounds.minX < master.width / 2
      && bounds.maxX >= master.width / 2
      && bounds.minY < master.height / 2
      && bounds.maxY >= master.height / 2
  ));
  expect(hand).toBeDefined();
  let handComponentMismatches = 0;
  let handAlphaMismatches = 0;
  for (const index of hand.indexes) {
    const y = Math.floor(index / master.width);
    const x = index - y * master.width;
    const paired = y * master.width + (master.width - 1 - x);
    if (labels[paired] !== hand.id) handComponentMismatches += 1;
    if (alphaAt(index) !== alphaAt(paired)) handAlphaMismatches += 1;
  }
  expect({ handAlphaMismatches, handComponentMismatches }).toEqual({
    handAlphaMismatches: 0,
    handComponentMismatches: 0,
  });
  return components;
}

describe('브랜드 파생 자산', () => {
  it('평면·질감·소형 마스터를 각각 지정된 안전 영역에서 사용해요', async () => {
    const [compactMasterBytes, flatMasterBytes, texturedMasterBytes, wordmarkFontBytes] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.compactMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.master)),
      readFile(resolve(BRAND_ASSET_PATHS.texturedMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont)),
    ]);
    const flatMaster = decodeBrandMaster(flatMasterBytes, { profile: 'flat' });
    const texturedMaster = decodeBrandMaster(texturedMasterBytes, { profile: 'textured' });
    const compactMaster = decodeBrandMaster(compactMasterBytes, { profile: 'compact' });

    expect(BRAND_ASSET_PATHS.compactMaster).toBe(
      'assets/brand/alarmpyo-mark-compact-master.png',
    );
    expect(BRAND_ASSET_PATHS.texturedMaster).toBe(
      'assets/brand/alarmpyo-mark-textured-master.png',
    );
    expect(flatMaster).toMatchObject({ height: 1024, width: 1024 });
    expect(texturedMaster).toMatchObject({ height: 1024, width: 1024 });
    expect(compactMaster).toMatchObject({ height: 48, width: 48 });
    expect(
      buildBrandAssets(
        flatMasterBytes,
        wordmarkFontBytes,
        texturedMasterBytes,
        compactMasterBytes,
      ).size,
    ).toBe(7);
  });

  it('화살표는 180도 회전, 10시 10분 바늘은 좌우 완전 대칭이에요', async () => {
    const [compactMasterBytes, flatMasterBytes, texturedMasterBytes] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.compactMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.master)),
      readFile(resolve(BRAND_ASSET_PATHS.texturedMaster)),
    ]);
    expect(expectExactLogoSymmetry(
      decodeBrandMaster(flatMasterBytes, { profile: 'flat' }),
    )).toHaveLength(15);
    expect(expectExactLogoSymmetry(
      decodeBrandMaster(texturedMasterBytes, { profile: 'textured' }),
    )).toHaveLength(15);
    expect(expectExactLogoSymmetry(
      decodeBrandMaster(compactMasterBytes, { profile: 'compact' }),
    )).toHaveLength(7);
  });

  it('적응형 전경과 단색 레이어가 같은 안전 영역 마크에서 파생돼요', async () => {
    const [compactMasterBytes, flatMasterBytes, texturedMasterBytes, wordmarkFontBytes] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.compactMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.master)),
      readFile(resolve(BRAND_ASSET_PATHS.texturedMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont)),
    ]);
    const assets = buildBrandAssets(
      flatMasterBytes,
      wordmarkFontBytes,
      texturedMasterBytes,
      compactMasterBytes,
    );
    const foreground = assets.get(BRAND_ASSET_PATHS.adaptiveForeground);
    const flatBounds = decodeBrandMaster(flatMasterBytes, { profile: 'flat' }).bounds;

    expect(foreground).toEqual(assets.get(BRAND_ASSET_PATHS.adaptiveMonochrome));
    expect(decodeBrandMaster(foreground, { profile: 'flat' }).bounds).toEqual(flatBounds);
    expect(assets.get(BRAND_ASSET_PATHS.favicon)).toBeInstanceOf(Buffer);
    expect(assets.get(BRAND_ASSET_PATHS.splash)).toBeInstanceOf(Buffer);
  });

  it('질감 마스터는 스플래시와 대표 그래픽에만 영향을 줘요', async () => {
    const [compactMasterBytes, flatMasterBytes, wordmarkFontBytes, texturedA, texturedB] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.compactMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.master)),
      readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont)),
      createTexturedMasterFixture(),
      createTexturedMasterFixture({ centerCutout: true }),
    ]);
    const assetsA = buildBrandAssets(
      flatMasterBytes,
      wordmarkFontBytes,
      texturedA,
      compactMasterBytes,
    );
    const assetsB = buildBrandAssets(
      flatMasterBytes,
      wordmarkFontBytes,
      texturedB,
      compactMasterBytes,
    );
    const texturedOutputs = new Set([
      BRAND_ASSET_PATHS.splash,
      BRAND_ASSET_PATHS.featureGraphic,
    ]);

    for (const [path, bytes] of assetsA) {
      if (texturedOutputs.has(path)) {
        expect(bytes.equals(assetsB.get(path))).toBe(false);
      } else {
        expect(bytes.equals(assetsB.get(path))).toBe(true);
      }
    }
  });

  it('질감 마스터의 크기·중심·여백 계약과 필수 입력을 검증해요', async () => {
    const [compactMasterBytes, flatMasterBytes, wordmarkFontBytes, validTextured, undersizedTextured] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.compactMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.master)),
      readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont)),
      createTexturedMasterFixture(),
      createTexturedMasterFixture({ extent: 700 }),
    ]);

    expect(decodeBrandMaster(validTextured, { profile: 'textured' })).toMatchObject({
      bounds: { maxX: 890, maxY: 890, minX: 133, minY: 133 },
    });
    expect(() => decodeBrandMaster(undersizedTextured, { profile: 'textured' }))
      .toThrow('72~76%');
    expect(() => buildBrandAssets(flatMasterBytes, wordmarkFontBytes))
      .toThrow('질감 브랜드 마스터 파일이 필요해요.');
    expect(() => buildBrandAssets(flatMasterBytes, wordmarkFontBytes, validTextured))
      .toThrow('소형 브랜드 마스터 파일이 필요해요.');
    expect(() => buildBrandAssets(
      flatMasterBytes,
      wordmarkFontBytes,
      validTextured,
      compactMasterBytes,
    )).not.toThrow();
  });

  it('같은 세 마스터에서는 모든 파생 파일을 바이트 단위로 동일하게 생성해요', async () => {
    const [compactMasterBytes, flatMasterBytes, texturedMasterBytes, wordmarkFontBytes] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.compactMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.master)),
      readFile(resolve(BRAND_ASSET_PATHS.texturedMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont)),
    ]);
    const first = buildBrandAssets(
      flatMasterBytes,
      wordmarkFontBytes,
      texturedMasterBytes,
      compactMasterBytes,
    );
    const second = buildBrandAssets(
      flatMasterBytes,
      wordmarkFontBytes,
      texturedMasterBytes,
      compactMasterBytes,
    );

    expect([...first.keys()]).toEqual([...second.keys()]);
    for (const [path, bytes] of first) expect(bytes.equals(second.get(path))).toBe(true);
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
    const [texturedMasterBytes, fontBytes] = await Promise.all([
      readFile(resolve(BRAND_ASSET_PATHS.texturedMaster)),
      readFile(resolve(BRAND_ASSET_PATHS.wordmarkFont)),
    ]);
    const graphic = composeBrandFeatureGraphic(
      decodeBrandMaster(texturedMasterBytes, { profile: 'textured' }),
      fontBytes,
    );
    const countLightPixels = (startX, endX) => {
      let count = 0;
      for (let y = 0; y < graphic.height; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * graphic.width + x) * 3;
          if (
            graphic.pixels[offset] > 160
            && graphic.pixels[offset + 1] > 160
            && graphic.pixels[offset + 2] > 160
          ) {
            count += 1;
          }
        }
      }
      return count;
    };

    expect(graphic).toMatchObject({ colorType: 2, height: 500, width: 1024 });
    expect(countLightPixels(0, 500)).toBeGreaterThan(25_000);
    expect(countLightPixels(550, 1024)).toBeGreaterThan(15_000);
    expect(countLightPixels(480, 540)).toBe(0);
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
