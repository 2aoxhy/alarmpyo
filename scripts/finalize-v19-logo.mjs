import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import sharp from 'sharp';

const CANVAS_SOURCE_SIZE = 1254;
const APP_FLAT_VISIBLE_SIZE = 580;
const APP_COMPACT_VISIBLE_SIZE = 36;
const APP_TEXTURED_VISIBLE_SIZE = 758;
const EXPORT_SIZES = Object.freeze([2048, 1024, 512, 256, 128, 64, 48, 32, 24]);
const TREATMENTS = Object.freeze(['white-on-black', 'white-transparent', 'black-transparent']);

function fail(message) {
  throw new Error(message);
}

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) fail('flat, texture, output 경로가 모두 필요해요.');
    values.set(key.slice(2), value);
  }
  const flat = values.get('flat');
  const micro = values.get('micro');
  const texture = values.get('texture');
  const output = values.get('output');
  if (!flat || !micro || !texture || !output) {
    fail('flat, micro, texture, output 경로가 모두 필요해요.');
  }
  return {
    flat: resolve(flat),
    micro: resolve(micro),
    output: resolve(output),
    texture: resolve(texture),
  };
}

async function readAlpha(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== CANVAS_SOURCE_SIZE || info.height !== CANVAS_SOURCE_SIZE || info.channels !== 4) {
    fail(`평면 소스는 ${CANVAS_SOURCE_SIZE}×${CANVAS_SOURCE_SIZE} RGBA여야 해요.`);
  }
  const alpha = new Uint8Array(info.width * info.height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4 + 3];
  return { alpha, height: info.height, width: info.width };
}

async function readTexture(path) {
  const { data, info } = await sharp(path).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== CANVAS_SOURCE_SIZE || info.height !== CANVAS_SOURCE_SIZE || info.channels !== 1) {
    fail(`질감 소스는 ${CANVAS_SOURCE_SIZE}×${CANVAS_SOURCE_SIZE} 이미지여야 해요.`);
  }
  return new Uint8Array(data);
}

function normalizeSolidSource(source) {
  const alpha = new Uint8Array(source.alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    const value = source.alpha[index];
    alpha[index] = value >= 240 ? 255 : value < 8 ? 0 : value;
  }
  return { ...source, alpha };
}

function findComponents(alpha, width, height) {
  const seen = new Uint8Array(alpha.length);
  const queue = new Int32Array(alpha.length);
  const components = [];
  for (let seed = 0; seed < alpha.length; seed += 1) {
    if (seen[seed] || alpha[seed] === 0) continue;
    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const pixels = [];
    queue[tail] = seed;
    tail += 1;
    seen[seed] = 1;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const y = Math.floor(index / width);
      const x = index - y * width;
      pixels.push(index);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= alpha.length || seen[neighbor] || alpha[neighbor] === 0) continue;
        const neighborY = Math.floor(neighbor / width);
        const neighborX = neighbor - neighborY * width;
        if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) continue;
        seen[neighbor] = 1;
        queue[tail] = neighbor;
        tail += 1;
      }
    }
    components.push({
      bounds: { maxX, maxY, minX, minY },
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      count: pixels.length,
      pixels,
    });
  }
  return components.sort((left, right) => right.count - left.count);
}

const transforms = Object.freeze({
  identity: (x, y, max) => [x, y],
  mirrorX: (x, y, max) => [max - x, y],
  mirrorY: (x, y, max) => [x, max - y],
  rotate180: (x, y, max) => [max - x, max - y],
  rotate90: (x, y, max) => [max - y, x],
  rotate270: (x, y, max) => [y, max - x],
});

function paintComponent(source, component, target, transformNames, predicate = () => true) {
  const width = CANVAS_SOURCE_SIZE;
  const max = width - 1;
  for (const index of component.pixels) {
    const y = Math.floor(index / width);
    const x = index - y * width;
    if (!predicate(x, y)) continue;
    const alpha = source[index];
    for (const transformName of transformNames) {
      const [targetX, targetY] = transforms[transformName](x, y, max);
      const targetIndex = targetY * width + targetX;
      target[targetIndex] = Math.max(target[targetIndex], alpha);
    }
  }
}

function closestTick(ticks, expectedDegrees, center) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tick of ticks) {
    const angle = (Math.atan2(tick.centerY - center, tick.centerX - center) * 180) / Math.PI;
    const distance = Math.abs(angle - expectedDegrees);
    if (distance < bestDistance) {
      best = tick;
      bestDistance = distance;
    }
  }
  if (!best || bestDistance > 8) fail(`${expectedDegrees}° 눈금을 찾지 못했어요.`);
  return best;
}

function buildSymmetricLayers(source) {
  const { alpha, height, width } = source;
  const center = (width - 1) / 2;
  const components = findComponents(alpha, width, height);
  const arrows = new Uint8Array(alpha.length);
  const hands = new Uint8Array(alpha.length);
  const cardinalTicks = new Uint8Array(alpha.length);
  const minorTicks = new Uint8Array(alpha.length);
  const arrow = components.find((component) => component.count > 40_000 && component.centerY < center);
  const hand = components.find(
    (component) => component.count > 4_000
      && component.count < 20_000
      && component.bounds.minX < center
      && component.bounds.maxX > center
      && component.bounds.minY < center
      && component.bounds.maxY > center,
  );
  const ticks = components.filter((component) => component.count >= 300 && component.count <= 3_000);
  const topCardinal = ticks.find(
    (component) => Math.abs(component.centerX - center) < 18
      && component.centerY < center
      && component.bounds.maxY - component.bounds.minY > component.bounds.maxX - component.bounds.minX,
  );
  if (!arrow || !hand || !topCardinal) fail('화살표·바늘·주요 눈금을 분리하지 못했어요.');
  const elevenTick = closestTick(ticks, -120, center);
  const tenTick = closestTick(ticks, -150, center);
  paintComponent(alpha, arrow, arrows, ['identity', 'rotate180']);
  paintComponent(alpha, hand, hands, ['identity', 'mirrorX'], (x) => x <= Math.floor(center));
  paintComponent(alpha, topCardinal, cardinalTicks, ['identity', 'rotate90', 'rotate180', 'rotate270']);
  paintComponent(alpha, elevenTick, minorTicks, ['identity', 'mirrorX', 'mirrorY', 'rotate180']);
  paintComponent(alpha, tenTick, minorTicks, ['identity', 'mirrorX', 'mirrorY', 'rotate180']);
  return { arrows, cardinalTicks, hands, minorTicks, sourceHeight: height, sourceWidth: width };
}

function buildSymmetricMicroLayers(source) {
  const cleaned = new Uint8Array(source.alpha.length);
  for (let index = 0; index < cleaned.length; index += 1) {
    cleaned[index] = source.alpha[index] >= 8 ? source.alpha[index] : 0;
  }
  const center = (source.width - 1) / 2;
  const components = findComponents(cleaned, source.width, source.height);
  const arrow = components.find((component) => component.count > 50_000 && component.centerY < center);
  const hand = components.find(
    (component) => component.count > 10_000
      && component.count < 50_000
      && component.bounds.minX < center
      && component.bounds.maxX > center
      && component.bounds.minY < center
      && component.bounds.maxY > center,
  );
  if (!arrow || !hand) fail('소형 화살표·바늘을 분리하지 못했어요.');
  const arrows = new Uint8Array(cleaned.length);
  const hands = new Uint8Array(cleaned.length);
  paintComponent(cleaned, arrow, arrows, ['identity', 'rotate180']);
  paintComponent(cleaned, hand, hands, ['identity', 'mirrorX'], (x) => x <= Math.floor(center));
  return {
    arrows,
    cardinalTicks: new Uint8Array(cleaned.length),
    hands,
    minorTicks: new Uint8Array(cleaned.length),
    sourceHeight: source.height,
    sourceWidth: source.width,
  };
}

function textureLayer(layer, texture, symmetry) {
  const result = new Uint8Array(layer.length);
  const max = CANVAS_SOURCE_SIZE - 1;
  for (let index = 0; index < layer.length; index += 1) {
    if (layer[index] === 0) continue;
    const y = Math.floor(index / CANVAS_SOURCE_SIZE);
    const x = index - y * CANVAS_SOURCE_SIZE;
    const samples = symmetry.map((name) => {
      const [sampleX, sampleY] = transforms[name](x, y, max);
      return texture[sampleY * CANVAS_SOURCE_SIZE + sampleX];
    });
    const textureValue = Math.max(...samples) / 255;
    const opacity = 0.64 + textureValue * 0.36;
    result[index] = Math.round(layer[index] * opacity);
  }
  return result;
}

function combineLayers(...layers) {
  const result = new Uint8Array(layers[0].length);
  for (const layer of layers) {
    for (let index = 0; index < layer.length; index += 1) result[index] = Math.max(result[index], layer[index]);
  }
  return result;
}

function boundsOf(alpha, threshold = 1) {
  const size = Math.sqrt(alpha.length);
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] < threshold) continue;
    const y = Math.floor(index / size);
    const x = index - y * size;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0) fail('로고 마스크가 비어 있어요.');
  return { height: maxY - minY + 1, maxX, maxY, minX, minY, width: maxX - minX + 1 };
}

function rgbaFromAlpha(alpha, color = 255) {
  const rgba = Buffer.alloc(alpha.length * 4);
  for (let index = 0; index < alpha.length; index += 1) {
    const offset = index * 4;
    rgba[offset] = color;
    rgba[offset + 1] = color;
    rgba[offset + 2] = color;
    rgba[offset + 3] = alpha[index];
  }
  return rgba;
}

async function resizeLayer(layer, crop, targetSize, visibleSize) {
  const rgba = rgbaFromAlpha(layer);
  const horizontalPadding = targetSize - visibleSize;
  const verticalPadding = targetSize - visibleSize;
  if (horizontalPadding % 2 !== 0 || verticalPadding % 2 !== 0) fail('중앙 배치 크기가 홀수예요.');
  const { data } = await sharp(rgba, {
    raw: { channels: 4, height: CANVAS_SOURCE_SIZE, width: CANVAS_SOURCE_SIZE },
  })
    .extract({ height: crop.height, left: crop.minX, top: crop.minY, width: crop.width })
    .resize(visibleSize, visibleSize, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .extend({
      background: { alpha: 0, b: 255, g: 255, r: 255 },
      bottom: verticalPadding / 2,
      left: horizontalPadding / 2,
      right: horizontalPadding / 2,
      top: verticalPadding / 2,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(targetSize * targetSize);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4 + 3];
  return alpha;
}

function enforceSymmetry(alpha, size, names) {
  const result = new Uint8Array(alpha);
  const max = size - 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const indexes = names.map((name) => {
        const [targetX, targetY] = transforms[name](x, y, max);
        return targetY * size + targetX;
      });
      const value = Math.max(...indexes.map((index) => alpha[index]));
      for (const index of indexes) result[index] = value;
    }
  }
  return result;
}

async function renderMark(layers, crop, targetSize, visibleSize, mode) {
  const rendered = [];
  rendered.push(enforceSymmetry(
    await resizeLayer(layers.arrows, crop, targetSize, visibleSize),
    targetSize,
    ['identity', 'rotate180'],
  ));
  rendered.push(enforceSymmetry(
    await resizeLayer(layers.hands, crop, targetSize, visibleSize),
    targetSize,
    ['identity', 'mirrorX'],
  ));
  if (mode !== 'micro') {
    rendered.push(enforceSymmetry(
      await resizeLayer(layers.cardinalTicks, crop, targetSize, visibleSize),
      targetSize,
      ['identity', 'mirrorX', 'mirrorY', 'rotate180'],
    ));
  }
  if (mode === 'full') {
    rendered.push(enforceSymmetry(
      await resizeLayer(layers.minorTicks, crop, targetSize, visibleSize),
      targetSize,
      ['identity', 'mirrorX', 'mirrorY', 'rotate180'],
    ));
  }
  return combineLayers(...rendered);
}

async function renderSmallMark({
  flatCrop,
  flatLayers,
  microCrop,
  microLayers,
  mode,
  targetSize,
  visibleSize,
}) {
  const micro = cleanSmallAlpha(
    await renderMark(microLayers, microCrop, targetSize, visibleSize, 'micro'),
    targetSize,
  );
  if (mode === 'micro') return micro;
  const cardinalOnly = await renderMark(
    {
      ...flatLayers,
      arrows: new Uint8Array(flatLayers.arrows.length),
      hands: new Uint8Array(flatLayers.hands.length),
      minorTicks: new Uint8Array(flatLayers.minorTicks.length),
    },
    flatCrop,
    targetSize,
    visibleSize,
    'compact',
  );
  return combineLayers(micro, cardinalOnly);
}

function standaloneVisibleSize(size) {
  const raw = Math.round(size * 0.74);
  if (raw % 2 === size % 2) return raw;
  return raw + 1;
}

function cleanSmallAlpha(alpha, size) {
  if (size > 32) return alpha;
  const result = new Uint8Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    const value = alpha[index];
    result[index] = value <= 95 ? 0 : Math.round(((value - 95) / 160) * 255);
  }
  return result;
}

function removeRasterArtifacts(alpha, size) {
  const result = new Uint8Array(alpha);
  for (let index = 0; index < result.length; index += 1) {
    if (result[index] < 8) result[index] = 0;
  }
  const minimumPixels = size >= 64
    ? Math.max(2, Math.round(size * size * 0.00002))
    : 1;
  const seen = new Uint8Array(result.length);
  const queue = new Int32Array(result.length);
  for (let seed = 0; seed < result.length; seed += 1) {
    if (seen[seed] || result[seed] === 0) continue;
    let head = 0;
    let tail = 0;
    const indexes = [];
    queue[tail] = seed;
    tail += 1;
    seen[seed] = 1;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const y = Math.floor(index / size);
      const x = index - y * size;
      indexes.push(index);
      for (const neighbor of [index - 1, index + 1, index - size, index + size]) {
        if (neighbor < 0 || neighbor >= result.length || seen[neighbor] || result[neighbor] === 0) continue;
        const neighborY = Math.floor(neighbor / size);
        const neighborX = neighbor - neighborY * size;
        if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) continue;
        seen[neighbor] = 1;
        queue[tail] = neighbor;
        tail += 1;
      }
    }
    if (indexes.length < minimumPixels) {
      for (const index of indexes) result[index] = 0;
    }
  }
  return result;
}

function enforceFortyEightPixelGaps(alpha) {
  const size = 48;
  const result = new Uint8Array(alpha);
  const components = findComponents(result, size, size)
    .filter((component) => component.count > 1)
    .sort((left, right) => right.count - left.count);
  if (components.length !== 7) fail('48px 로고는 화살표 2개·바늘 1개·주요 눈금 4개여야 해요.');
  const arrows = components.slice(0, 2);
  const ticks = components.slice(3);
  const remove = new Set();
  const coordinates = (index) => [index % size, Math.floor(index / size)];
  const distance = (left, right) => {
    const [leftX, leftY] = coordinates(left);
    const [rightX, rightY] = coordinates(right);
    return Math.hypot(leftX - rightX, leftY - rightY);
  };
  for (const left of arrows[0].pixels) {
    for (const right of arrows[1].pixels) {
      if (distance(left, right) < 3) {
        remove.add(left);
        remove.add(right);
      }
    }
  }
  for (const arrow of arrows) {
    for (const arrowPixel of arrow.pixels) {
      if (ticks.some((tick) => tick.pixels.some((tickPixel) => distance(arrowPixel, tickPixel) < 4))) {
        remove.add(arrowPixel);
      }
    }
  }
  for (const index of [...remove]) {
    const y = Math.floor(index / size);
    const x = index - y * size;
    remove.add((size - 1 - y) * size + (size - 1 - x));
  }
  for (const index of remove) result[index] = 0;
  return result;
}

async function encodeTransparent(alpha, size, color) {
  return sharp(rgbaFromAlpha(alpha, color), { raw: { channels: 4, height: size, width: size } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function encodeBlackBackground(alpha, size) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let index = 0; index < alpha.length; index += 1) {
    pixels[index * 3] = alpha[index];
    pixels[index * 3 + 1] = alpha[index];
    pixels[index * 3 + 2] = alpha[index];
  }
  return sharp(pixels, { raw: { channels: 3, height: size, width: size } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function commitOutputs(outputs) {
  const previous = new Map();
  for (const path of outputs.keys()) {
    try {
      previous.set(path, await readFile(path));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      previous.set(path, null);
    }
  }
  try {
    for (const [path, bytes] of outputs) await writeFile(path, bytes);
  } catch (error) {
    for (const [path, bytes] of previous) {
      if (bytes) await writeFile(path, bytes);
      else await rm(path, { force: true });
    }
    throw error;
  }
}

function assertPairSymmetry(layer, size, transformName, label) {
  const max = size - 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [pairX, pairY] = transforms[transformName](x, y, max);
      if (layer[y * size + x] !== layer[pairY * size + pairX]) fail(`${label} 대칭 검증에 실패했어요.`);
    }
  }
}

async function main() {
  const paths = parseArguments(process.argv.slice(2));
  const [rawFlatSource, rawMicroSource] = await Promise.all([
    readAlpha(paths.flat),
    readAlpha(paths.micro),
  ]);
  const flatSource = normalizeSolidSource(rawFlatSource);
  const microSource = normalizeSolidSource(rawMicroSource);
  const texture = await readTexture(paths.texture);
  const flatLayers = buildSymmetricLayers(flatSource);
  const microLayers = buildSymmetricMicroLayers(microSource);
  const texturedLayers = {
    arrows: textureLayer(flatLayers.arrows, texture, ['identity', 'rotate180']),
    cardinalTicks: flatLayers.cardinalTicks,
    hands: flatLayers.hands,
    minorTicks: flatLayers.minorTicks,
  };
  const sourceBounds = boundsOf(combineLayers(
    flatLayers.arrows,
    flatLayers.hands,
    flatLayers.cardinalTicks,
    flatLayers.minorTicks,
  ));
  const sourceCrop = {
    height: sourceBounds.height,
    minX: sourceBounds.minX,
    minY: sourceBounds.minY,
    width: sourceBounds.width,
  };
  const microBounds = boundsOf(combineLayers(microLayers.arrows, microLayers.hands));
  const microCrop = {
    height: microBounds.height,
    minX: microBounds.minX,
    minY: microBounds.minY,
    width: microBounds.width,
  };
  const appFlatLayers = flatLayers;
  const appFlat = removeRasterArtifacts(
    await renderMark(appFlatLayers, sourceCrop, 1024, APP_FLAT_VISIBLE_SIZE, 'full'),
    1024,
  );
  const appTextured = removeRasterArtifacts(
    await renderMark(texturedLayers, sourceCrop, 1024, APP_TEXTURED_VISIBLE_SIZE, 'full'),
    1024,
  );
  const appCompact = enforceFortyEightPixelGaps(removeRasterArtifacts(await renderSmallMark({
    flatCrop: sourceCrop,
    flatLayers,
    microCrop,
    microLayers,
    mode: 'compact',
    targetSize: 48,
    visibleSize: APP_COMPACT_VISIBLE_SIZE,
  }), 48));
  const root = resolve(import.meta.dirname, '..');
  const outputs = new Map();
  outputs.set(
    resolve(root, 'assets/brand/alarmpyo-mark-master.png'),
    await encodeTransparent(appFlat, 1024, 255),
  );
  outputs.set(
    resolve(root, 'assets/brand/alarmpyo-mark-textured-master.png'),
    await encodeTransparent(appTextured, 1024, 255),
  );
  outputs.set(
    resolve(root, 'assets/brand/alarmpyo-mark-compact-master.png'),
    await encodeTransparent(appCompact, 48, 255),
  );

  await mkdir(paths.output, { recursive: true });
  for (const treatment of TREATMENTS) await mkdir(resolve(paths.output, treatment), { recursive: true });
  const manifest = [];
  for (const size of EXPORT_SIZES) {
    const textured = size >= 256;
    const mode = size >= 64 ? 'full' : size >= 32 ? 'compact' : 'micro';
    const sourceLayers = textured ? texturedLayers : flatLayers;
    const renderedAlpha = size <= 48
      ? await renderSmallMark({
          flatCrop: sourceCrop,
          flatLayers,
          microCrop,
          microLayers,
          mode,
          targetSize: size,
          visibleSize: standaloneVisibleSize(size),
        })
      : await renderMark(
          sourceLayers,
          sourceCrop,
          size,
          standaloneVisibleSize(size),
          mode,
        );
    const cleanAlpha = removeRasterArtifacts(renderedAlpha, size);
    const alpha = size === 48 ? enforceFortyEightPixelGaps(cleanAlpha) : cleanAlpha;
    const fileName = `alarmpyo-logo-v19-${size}.png`;
    const [blackBackground, whiteTransparent, blackTransparent] = await Promise.all([
      encodeBlackBackground(alpha, size),
      encodeTransparent(alpha, size, 255),
      encodeTransparent(alpha, size, 0),
    ]);
    outputs.set(resolve(paths.output, 'white-on-black', fileName), blackBackground);
    outputs.set(resolve(paths.output, 'white-transparent', fileName), whiteTransparent);
    outputs.set(resolve(paths.output, 'black-transparent', fileName), blackTransparent);
    const bounds = boundsOf(alpha);
    manifest.push({ bounds, mode: textured ? `textured-${mode}` : `flat-${mode}`, size });
  }
  assertPairSymmetry(
    await renderMark({ ...flatLayers, cardinalTicks: new Uint8Array(flatLayers.cardinalTicks.length), hands: new Uint8Array(flatLayers.hands.length), minorTicks: new Uint8Array(flatLayers.minorTicks.length) }, sourceCrop, 1024, APP_TEXTURED_VISIBLE_SIZE, 'micro'),
    1024,
    'rotate180',
    '화살표',
  );
  assertPairSymmetry(
    await renderMark({ ...flatLayers, arrows: new Uint8Array(flatLayers.arrows.length), cardinalTicks: new Uint8Array(flatLayers.cardinalTicks.length), minorTicks: new Uint8Array(flatLayers.minorTicks.length) }, sourceCrop, 1024, APP_TEXTURED_VISIBLE_SIZE, 'micro'),
    1024,
    'mirrorX',
    '시계 바늘',
  );
  outputs.set(resolve(paths.output, 'manifest.json'), Buffer.from(`${JSON.stringify({
    exports: manifest,
    geometry: {
      arrows: 'exact 180-degree rotational symmetry',
      hands: 'exact vertical-axis mirror symmetry at 10:10',
      standaloneVisibleRatio: 0.74,
    },
    sources: {
      flat: { file: basename(paths.flat), sha256: await sha256File(paths.flat) },
      micro: { file: basename(paths.micro), sha256: await sha256File(paths.micro) },
      texture: { file: basename(paths.texture), sha256: await sha256File(paths.texture) },
    },
  }, null, 2)}\n`, 'utf8'));
  await commitOutputs(outputs);
  console.log(`대칭 로고 마스크 3개와 독립 PNG ${EXPORT_SIZES.length * TREATMENTS.length}개를 생성했어요.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
