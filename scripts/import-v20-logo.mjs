import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import sharp from 'sharp';

const SOURCE_SIZE = 1254;
const FLAT_SIZE = 1024;
const FLAT_VISIBLE_SIZE = 560;
const TEXTURED_SIZE = 1024;
const TEXTURED_VISIBLE_SIZE = 758;
const COMPACT_SIZE = 48;
const COMPACT_VISIBLE_SIZE = 38;
const PIXEL_THRESHOLD = 8;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const root = resolve(import.meta.dirname, '..');
const defaultSource = resolve(
  root,
  'assets/brand/alarmpyo-v20-selected-source.png',
);

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  if (argv.length === 0) return { source: defaultSource };
  if (argv.length !== 2 || argv[0] !== '--source' || !argv[1]) {
    fail('사용법: node scripts/import-v20-logo.mjs [--source <선택 PNG>]');
  }
  return { source: resolve(argv[1]) };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stripPngMetadata(bytes) {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail('정규화된 선택 로고가 PNG 형식이 아니에요.');
  }
  const chunks = [PNG_SIGNATURE];
  for (let offset = PNG_SIGNATURE.length; offset + 12 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) fail('정규화된 선택 로고 PNG가 잘렸어요.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (['IHDR', 'IDAT', 'IEND'].includes(type)) {
      chunks.push(bytes.subarray(offset, end));
    }
    offset = end;
    if (type === 'IEND') return Buffer.concat(chunks);
  }
  fail('정규화된 선택 로고 PNG에 IEND가 없어요.');
}

function findComponents(alpha, width, height) {
  const seen = new Uint8Array(alpha.length);
  const queue = new Int32Array(alpha.length);
  const components = [];

  for (let seed = 0; seed < alpha.length; seed += 1) {
    if (seen[seed] || alpha[seed] < PIXEL_THRESHOLD) continue;
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

      for (const neighbor of [
        index - 1,
        index + 1,
        index - width,
        index + width,
      ]) {
        if (
          neighbor < 0 ||
          neighbor >= alpha.length ||
          seen[neighbor] ||
          alpha[neighbor] < PIXEL_THRESHOLD
        ) {
          continue;
        }
        const neighborY = Math.floor(neighbor / width);
        const neighborX = neighbor - neighborY * width;
        if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) {
          continue;
        }
        seen[neighbor] = 1;
        queue[tail] = neighbor;
        tail += 1;
      }
    }

    components.push({
      bounds: { maxX, maxY, minX, minY },
      centerY: (minY + maxY) / 2,
      count: pixels.length,
      pixels,
    });
  }

  return components.sort((left, right) => right.count - left.count);
}

function buildSymmetricLayers(sourceAlpha, visualAlpha, width, height) {
  const components = findComponents(sourceAlpha, width, height).filter(
    ({ count }) => count >= 10_000,
  );
  if (components.length !== 3) {
    fail(
      `선택 로고에서 화살표 2개와 바늘 1개를 찾지 못했어요. 확인된 주요 요소: ${components.length}개`,
    );
  }

  const hand = components.at(-1);
  const arrows = components.slice(0, 2);
  const topArrow = arrows.reduce((top, item) =>
    item.centerY < top.centerY ? item : top,
  );
  if (!hand || !topArrow || hand.count >= topArrow.count) {
    fail('선택 로고의 화살표와 바늘 구성을 구분하지 못했어요.');
  }

  const center = (width - 1) / 2;
  const max = width - 1;
  const arrowLayer = new Uint8Array(sourceAlpha.length);
  const handLayer = new Uint8Array(sourceAlpha.length);

  for (const index of topArrow.pixels) {
    const y = Math.floor(index / width);
    const x = index - y * width;
    const value = visualAlpha[index];
    const paired = (max - y) * width + (max - x);
    arrowLayer[index] = Math.max(arrowLayer[index], value);
    arrowLayer[paired] = Math.max(arrowLayer[paired], value);
  }

  for (const index of hand.pixels) {
    const y = Math.floor(index / width);
    const x = index - y * width;
    if (x > Math.floor(center)) continue;
    const value = visualAlpha[index];
    const paired = y * width + (max - x);
    handLayer[index] = Math.max(handLayer[index], value);
    handLayer[paired] = Math.max(handLayer[paired], value);
  }

  return { arrowLayer, handLayer };
}

function boundsOf(...layers) {
  const width = SOURCE_SIZE;
  let minX = width;
  let minY = width;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < layers[0].length; index += 1) {
    if (!layers.some((layer) => layer[index] >= PIXEL_THRESHOLD)) continue;
    const y = Math.floor(index / width);
    const x = index - y * width;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) fail('선택 로고가 비어 있어요.');
  return {
    height: maxY - minY + 1,
    maxX,
    maxY,
    minX,
    minY,
    width: maxX - minX + 1,
  };
}

async function resizeLayer(layer, bounds, targetSize, visibleSize, solid) {
  const cropped = Buffer.alloc(bounds.width * bounds.height);
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const value = layer[(bounds.minY + y) * SOURCE_SIZE + bounds.minX + x];
      cropped[y * bounds.width + x] = solid
        ? value >= PIXEL_THRESHOLD
          ? 255
          : 0
        : value;
    }
  }

  const resized = await sharp(cropped, {
    raw: { channels: 1, height: bounds.height, width: bounds.width },
  })
    .resize(visibleSize, visibleSize, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .greyscale()
    .raw()
    .toBuffer();
  const result = new Uint8Array(targetSize * targetSize);
  const offset = Math.floor((targetSize - visibleSize) / 2);
  for (let y = 0; y < visibleSize; y += 1) {
    for (let x = 0; x < visibleSize; x += 1) {
      let value = resized[y * visibleSize + x];
      if (solid) value = value >= 240 ? 255 : value < PIXEL_THRESHOLD ? 0 : value;
      result[(offset + y) * targetSize + offset + x] = value;
    }
  }
  return result;
}

function enforceSymmetry(layer, size, mode) {
  const result = new Uint8Array(layer);
  const max = size - 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pairX = max - x;
      const pairY = mode === 'rotate180' ? max - y : y;
      const index = y * size + x;
      const paired = pairY * size + pairX;
      const value = Math.max(result[index], result[paired]);
      result[index] = value;
      result[paired] = value;
    }
  }
  return result;
}

function combine(...layers) {
  const result = new Uint8Array(layers[0].length);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Math.max(...layers.map((layer) => layer[index]));
  }
  return result;
}

function removeSmallComponents(alpha, size, minimumPixels) {
  const components = findComponents(alpha, size, size);
  const result = new Uint8Array(alpha.length);
  for (const component of components) {
    if (component.count < minimumPixels) continue;
    for (const index of component.pixels) result[index] = alpha[index];
  }
  return result;
}

function erodeBinaryLayer(layer, size) {
  const result = new Uint8Array(layer.length);
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const index = y * size + x;
      if (
        layer[index] === 255 &&
        layer[index - 1] === 255 &&
        layer[index + 1] === 255 &&
        layer[index - size] === 255 &&
        layer[index + size] === 255
      ) {
        result[index] = 255;
      }
    }
  }
  return result;
}

function encodeWhiteMark(alpha, size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let index = 0; index < alpha.length; index += 1) {
    rgba[index * 4] = 255;
    rgba[index * 4 + 1] = 255;
    rgba[index * 4 + 2] = 255;
    rgba[index * 4 + 3] = alpha[index];
  }
  return sharp(rgba, { raw: { channels: 4, height: size, width: size } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function buildMaster({
  arrowLayer,
  bounds,
  handLayer,
  minimumPixels,
  solid,
  targetSize,
  visibleSize,
}) {
  let arrows = await resizeLayer(
    arrowLayer,
    bounds,
    targetSize,
    visibleSize,
    solid,
  );
  let hands = await resizeLayer(
    handLayer,
    bounds,
    targetSize,
    visibleSize,
    solid,
  );
  arrows = enforceSymmetry(arrows, targetSize, 'rotate180');
  hands = enforceSymmetry(hands, targetSize, 'mirrorX');
  let combined = removeSmallComponents(
    combine(arrows, hands),
    targetSize,
    minimumPixels,
  );
  if (targetSize === COMPACT_SIZE) {
    for (let index = 0; index < arrows.length; index += 1) {
      arrows[index] = arrows[index] >= 96 ? 255 : 0;
      hands[index] = hands[index] >= 96 ? 255 : 0;
    }
    arrows = enforceSymmetry(arrows, targetSize, 'rotate180');
    arrows = erodeBinaryLayer(arrows, targetSize);
    arrows = enforceSymmetry(arrows, targetSize, 'rotate180');
    hands = enforceSymmetry(hands, targetSize, 'mirrorX');
    combined = removeSmallComponents(
      combine(arrows, hands),
      targetSize,
      minimumPixels,
    );
  }
  return encodeWhiteMark(combined, targetSize);
}

async function writeOutputsAtomically(outputs) {
  const backups = new Map();
  const temporaryPaths = [];
  try {
    for (const [path, bytes] of outputs) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      temporaryPaths.push(temporary);
      await writeFile(temporary, bytes, { flag: 'wx' });
      backups.set(path, await readFile(path).catch(() => null));
    }
    for (const [path] of outputs) {
      const temporary = `${path}.${process.pid}.tmp`;
      await rm(path, { force: true });
      await rename(temporary, path);
    }
  } catch (error) {
    for (const temporary of temporaryPaths) await rm(temporary, { force: true });
    for (const [path, bytes] of backups) {
      if (bytes) await writeFile(path, bytes);
      else await rm(path, { force: true });
    }
    throw error;
  }
}

export async function importV20Logo(sourcePath) {
  const sourceBytes = await readFile(sourcePath);
  const sourceMetadata = await sharp(sourceBytes).metadata();
  assertV20SourceMetadata(sourceMetadata);
  const { data, info } = await sharp(sourceBytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    info.width !== SOURCE_SIZE ||
    info.height !== SOURCE_SIZE ||
    info.channels !== 4
  ) {
    fail(`선택 로고는 ${SOURCE_SIZE}×${SOURCE_SIZE}px RGBA PNG여야 해요.`);
  }

  const sourceAlpha = new Uint8Array(SOURCE_SIZE * SOURCE_SIZE);
  const visualAlpha = new Uint8Array(sourceAlpha.length);
  for (let index = 0; index < sourceAlpha.length; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3];
    const luminance = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    sourceAlpha[index] = alpha;
    visualAlpha[index] = Math.round((alpha * luminance) / 255);
  }

  const layers = buildSymmetricLayers(
    sourceAlpha,
    visualAlpha,
    SOURCE_SIZE,
    SOURCE_SIZE,
  );
  const bounds = boundsOf(layers.arrowLayer, layers.handLayer);
  const normalizedSource = stripPngMetadata(
    await sharp(sourceBytes)
      .ensureAlpha()
      .png({ compressionLevel: 9, palette: false })
      .toBuffer(),
  );
  const [flat, textured, compact] = await Promise.all([
    buildMaster({
      ...layers,
      bounds,
      minimumPixels: 32,
      solid: true,
      targetSize: FLAT_SIZE,
      visibleSize: FLAT_VISIBLE_SIZE,
    }),
    buildMaster({
      ...layers,
      bounds,
      minimumPixels: 32,
      solid: false,
      targetSize: TEXTURED_SIZE,
      visibleSize: TEXTURED_VISIBLE_SIZE,
    }),
    buildMaster({
      ...layers,
      bounds,
      minimumPixels: 1,
      solid: true,
      targetSize: COMPACT_SIZE,
      visibleSize: COMPACT_VISIBLE_SIZE,
    }),
  ]);

  const sourceRecord = Buffer.from(
    `${JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        normalizedFile: basename(defaultSource),
        normalizedSha256: sha256(normalizedSource),
        originalFile: basename(sourcePath),
        originalSha256: sha256(sourceBytes),
        symmetry: {
          arrows: 'exact 180-degree rotational symmetry from the selected top arrow',
          hands: 'exact vertical-axis mirror symmetry from the selected left hand',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await writeOutputsAtomically(
    new Map([
      [defaultSource, normalizedSource],
      [
        resolve(root, 'assets/brand/alarmpyo-v20-selected-source.json'),
        sourceRecord,
      ],
      [resolve(root, 'assets/brand/alarmpyo-mark-master.png'), flat],
      [
        resolve(root, 'assets/brand/alarmpyo-mark-textured-master.png'),
        textured,
      ],
      [resolve(root, 'assets/brand/alarmpyo-mark-compact-master.png'), compact],
    ]),
  );
}

export function assertV20SourceMetadata(sourceMetadata) {
  if (
    sourceMetadata.format !== 'png' ||
    sourceMetadata.width !== SOURCE_SIZE ||
    sourceMetadata.height !== SOURCE_SIZE ||
    sourceMetadata.channels !== 4 ||
    sourceMetadata.hasAlpha !== true ||
    sourceMetadata.depth !== 'uchar'
  ) {
    fail(
      `선택 로고는 ${SOURCE_SIZE}×${SOURCE_SIZE}px, 8비트 RGBA PNG여야 해요.`,
    );
  }
  return true;
}

async function main() {
  const { source } = parseArguments(process.argv.slice(2));
  await importV20Logo(source);
  console.log('선택한 V20 로고를 대칭 마스터 3종으로 정규화했어요.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
