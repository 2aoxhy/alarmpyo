import { Buffer } from 'node:buffer';
import { deflateSync, inflateSync } from 'node:zlib';

import opentype from 'opentype.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BRAND_BACKGROUND = Object.freeze({ red: 16, green: 18, blue: 20 });

export const BRAND_ASSET_PATHS = Object.freeze({
  master: 'assets/brand/alarmpyo-mark-master.png',
  wordmarkFont: 'assets/fonts/WantedSans-ExtraBold.ttf',
  appIcon: 'assets/images/alarmpyo-icon.png',
  adaptiveForeground: 'assets/images/alarmpyo-adaptive-foreground.png',
  adaptiveMonochrome: 'assets/images/alarmpyo-adaptive-monochrome.png',
  favicon: 'assets/images/favicon.png',
  splash: 'assets/images/splash-transparent.png',
  playIcon: 'assets/play-store/alarmpyo-icon-512.png',
  featureGraphic: 'assets/play-store/alarmpyo-feature-graphic.png',
});

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return result;
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

export function decodeBrandMaster(bytes) {
  ensure(bytes.subarray(0, 8).equals(PNG_SIGNATURE), '브랜드 마스터는 PNG여야 해요.');

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressedParts = [];
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    ensure(dataEnd + 4 <= bytes.length, '브랜드 마스터 PNG가 잘렸어요.');
    const type = bytes.toString('ascii', typeStart, dataStart);
    ensure(
      crc32(bytes.subarray(typeStart, dataEnd)) === bytes.readUInt32BE(dataEnd),
      `브랜드 마스터 PNG의 ${type} CRC가 손상됐어요.`,
    );
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === 'IDAT') {
      compressedParts.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  ensure(width === 1024 && height === 1024, '브랜드 마스터는 1024×1024px여야 해요.');
  ensure(bitDepth === 8 && colorType === 6, '브랜드 마스터는 8비트 RGBA PNG여야 해요.');
  ensure(interlace === 0, '브랜드 마스터는 비인터레이스 PNG여야 해요.');
  ensure(compressedParts.length > 0, '브랜드 마스터 PNG에 픽셀 데이터가 없어요.');

  const inflated = inflateSync(Buffer.concat(compressedParts));
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  ensure(inflated.length === (rowLength + 1) * height, '브랜드 마스터 픽셀 길이가 잘못됐어요.');
  const pixels = new Uint8Array(rowLength * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    ensure(filter <= 4, '브랜드 마스터 PNG 필터가 잘못됐어요.');
    const rowOffset = y * rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[sourceOffset];
      sourceOffset += 1;
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[rowOffset - rowLength + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[rowOffset - rowLength + x - bytesPerPixel]
        : 0;
      const predictor = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? Math.floor((left + up) / 2)
              : paethPredictor(left, up, upperLeft);
      pixels[rowOffset + x] = (raw + predictor) & 0xff;
    }
  }

  let visiblePixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3];
    if (alpha === 0) continue;
    ensure(
      pixels[offset] === 255 && pixels[offset + 1] === 255 && pixels[offset + 2] === 255,
      '브랜드 마스터의 보이는 픽셀은 순백색이어야 해요.',
    );
    const index = offset / 4;
    const x = index % width;
    const y = Math.floor(index / width);
    visiblePixels += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  ensure(visiblePixels > 0, '브랜드 마스터 마크가 비어 있어요.');
  ensure(minX >= 199 && minY >= 199 && maxX < 825 && maxY < 825, '브랜드 마스터가 적응형 아이콘 안전 영역을 벗어났어요.');

  return { height, pixels, width };
}

function encodePng({ colorType, height, pixels, width }) {
  const channels = colorType === 6 ? 4 : 3;
  ensure(pixels.length === width * height * channels, 'PNG 픽셀 길이가 잘못됐어요.');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const rows = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * channels + 1);
    rows[rowOffset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * channels, width * channels)
      .copy(rows, rowOffset + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('sRGB', Buffer.from([0])),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function resizeWhiteMark(source, targetWidth, targetHeight) {
  const pixels = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * source.height) / targetHeight - 0.5;
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(source.height - 1, y0 + 1);
    const wy = Math.max(0, sourceY - y0);
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * source.width) / targetWidth - 0.5;
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(source.width - 1, x0 + 1);
      const wx = Math.max(0, sourceX - x0);
      const alphaAt = (sampleX, sampleY) => source.pixels[(sampleY * source.width + sampleX) * 4 + 3];
      const top = alphaAt(x0, y0) * (1 - wx) + alphaAt(x1, y0) * wx;
      const bottom = alphaAt(x0, y1) * (1 - wx) + alphaAt(x1, y1) * wx;
      const offset = (y * targetWidth + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(top * (1 - wy) + bottom * wy);
    }
  }
  return { height: targetHeight, pixels, width: targetWidth };
}

function compositeMarks(marks, width, height, { colorType = 6 } = {}) {
  const channels = colorType === 6 ? 4 : 3;
  const pixels = new Uint8Array(width * height * channels);
  for (let offset = 0; offset < pixels.length; offset += channels) {
    pixels[offset] = BRAND_BACKGROUND.red;
    pixels[offset + 1] = BRAND_BACKGROUND.green;
    pixels[offset + 2] = BRAND_BACKGROUND.blue;
    if (channels === 4) pixels[offset + 3] = 255;
  }
  for (const { mark, x = 0, y = 0 } of marks) {
    for (let markY = 0; markY < mark.height; markY += 1) {
      for (let markX = 0; markX < mark.width; markX += 1) {
        const targetX = x + markX;
        const targetY = y + markY;
        if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) continue;
        const markOffset = (markY * mark.width + markX) * 4;
        const alpha = mark.pixels[markOffset + 3] / 255;
        if (alpha === 0) continue;
        const targetOffset = (targetY * width + targetX) * channels;
        pixels[targetOffset] = Math.round(255 * alpha + pixels[targetOffset] * (1 - alpha));
        pixels[targetOffset + 1] = Math.round(255 * alpha + pixels[targetOffset + 1] * (1 - alpha));
        pixels[targetOffset + 2] = Math.round(255 * alpha + pixels[targetOffset + 2] * (1 - alpha));
      }
    }
  }
  return { colorType, height, pixels, width };
}

function compositeMark(mark, width, height, { colorType = 6, x = 0, y = 0 } = {}) {
  return compositeMarks([{ mark, x, y }], width, height, { colorType });
}

function appendCurvePoints(contour, command, current) {
  if (command.type === 'L') {
    contour.push({ x: command.x, y: command.y });
    return { x: command.x, y: command.y };
  }

  const steps = command.type === 'Q' ? 16 : 24;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const inverse = 1 - t;
    if (command.type === 'Q') {
      contour.push({
        x: inverse * inverse * current.x + 2 * inverse * t * command.x1 + t * t * command.x,
        y: inverse * inverse * current.y + 2 * inverse * t * command.y1 + t * t * command.y,
      });
    } else {
      contour.push({
        x:
          inverse ** 3 * current.x
          + 3 * inverse * inverse * t * command.x1
          + 3 * inverse * t * t * command.x2
          + t ** 3 * command.x,
        y:
          inverse ** 3 * current.y
          + 3 * inverse * inverse * t * command.y1
          + 3 * inverse * t * t * command.y2
          + t ** 3 * command.y,
      });
    }
  }
  return { x: command.x, y: command.y };
}

function flattenPath(commands) {
  const contours = [];
  let contour = null;
  let current = null;
  let start = null;

  const closeContour = () => {
    if (contour && contour.length >= 2) {
      const last = contour.at(-1);
      if (last.x !== start.x || last.y !== start.y) contour.push({ ...start });
      contours.push(contour);
    }
    contour = null;
  };

  for (const command of commands) {
    if (command.type === 'M') {
      closeContour();
      start = { x: command.x, y: command.y };
      current = start;
      contour = [{ ...start }];
    } else if (command.type === 'Z') {
      closeContour();
      current = start;
    } else {
      ensure(contour && current, '워드마크 글리프 경로의 시작점이 없어요.');
      ensure(['L', 'Q', 'C'].includes(command.type), `지원하지 않는 글리프 경로 명령이에요: ${command.type}`);
      current = appendCurvePoints(contour, command, current);
    }
  }
  closeContour();
  return contours;
}

function rasterizeContours(contours, width, height, bounds, scale = 4) {
  const coverage = new Uint8Array(width * height);
  const scaledWidth = width * scale;
  const startY = Math.max(0, Math.floor(bounds.y1 * scale));
  const endY = Math.min(height * scale, Math.ceil(bounds.y2 * scale));

  for (let sampleYIndex = startY; sampleYIndex < endY; sampleYIndex += 1) {
    const sampleY = (sampleYIndex + 0.5) / scale;
    const intersections = [];
    for (const contour of contours) {
      for (let index = 1; index < contour.length; index += 1) {
        const from = contour[index - 1];
        const to = contour[index];
        if (!((from.y <= sampleY && to.y > sampleY) || (to.y <= sampleY && from.y > sampleY))) {
          continue;
        }
        intersections.push(from.x + ((sampleY - from.y) * (to.x - from.x)) / (to.y - from.y));
      }
    }
    intersections.sort((left, right) => left - right);

    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const startX = Math.max(0, Math.ceil(intersections[index] * scale - 0.5));
      const endX = Math.min(scaledWidth, Math.ceil(intersections[index + 1] * scale - 0.5));
      for (let sampleXIndex = startX; sampleXIndex < endX; sampleXIndex += 1) {
        const pixelX = Math.floor(sampleXIndex / scale);
        const pixelY = Math.floor(sampleYIndex / scale);
        coverage[pixelY * width + pixelX] += 1;
      }
    }
  }

  const pixels = new Uint8Array(width * height * 4);
  const sampleCount = scale * scale;
  for (let index = 0; index < coverage.length; index += 1) {
    const offset = index * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = Math.round((coverage[index] / sampleCount) * 255);
  }
  return { height, pixels, width };
}

export function renderBrandWordmark(fontBytes) {
  ensure(fontBytes?.length > 0, '워드마크 글꼴 파일이 비어 있어요.');
  const arrayBuffer = fontBytes.buffer.slice(
    fontBytes.byteOffset,
    fontBytes.byteOffset + fontBytes.byteLength,
  );
  const font = opentype.parse(arrayBuffer);
  ensure(font.getEnglishName('fullName') === 'Wanted Sans ExtraBold', '워드마크는 Wanted Sans ExtraBold를 사용해야 해요.');
  for (const character of '알람표') {
    ensure(font.charToGlyphIndex(character) !== 0, `워드마크 글꼴에 ${character} 글리프가 없어요.`);
  }

  const path = font.getPath('알람표', 560, 305, 144, { kerning: true });
  const bounds = path.getBoundingBox();
  ensure(
    bounds.x1 >= 550 && bounds.x2 <= 950 && bounds.y1 >= 175 && bounds.y2 <= 325,
    '워드마크가 대표 그래픽의 지정 영역을 벗어났어요.',
  );
  return rasterizeContours(flattenPath(path.commands), 1024, 500, bounds);
}

export function composeBrandFeatureGraphic(master, wordmarkFontBytes) {
  ensure(master?.width === 1024 && master?.height === 1024, '대표 그래픽 마스터 크기가 잘못됐어요.');
  return compositeMarks(
    [
      { mark: resizeWhiteMark(master, 480, 480), x: 40, y: 10 },
      { mark: renderBrandWordmark(wordmarkFontBytes) },
    ],
    1024,
    500,
    { colorType: 2 },
  );
}

function placeTransparentMark(mark, width, height, x, y) {
  const pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
  }
  for (let markY = 0; markY < mark.height; markY += 1) {
    for (let markX = 0; markX < mark.width; markX += 1) {
      const sourceOffset = (markY * mark.width + markX) * 4;
      const targetOffset = ((y + markY) * width + x + markX) * 4;
      pixels[targetOffset + 3] = mark.pixels[sourceOffset + 3];
    }
  }
  return { colorType: 6, height, pixels, width };
}

export function buildBrandAssets(masterBytes, wordmarkFontBytes) {
  const master = decodeBrandMaster(masterBytes);
  const normalizedMark = encodePng({ colorType: 6, ...master });
  const adaptiveMark = encodePng(
    placeTransparentMark(resizeWhiteMark(master, 788, 788), 1024, 1024, 118, 118),
  );
  const faviconMark = resizeWhiteMark(master, 48, 48);
  const playMark = resizeWhiteMark(master, 512, 512);
  const featureGraphic = composeBrandFeatureGraphic(master, wordmarkFontBytes);
  return new Map([
    [BRAND_ASSET_PATHS.appIcon, encodePng(compositeMark(master, 1024, 1024))],
    [BRAND_ASSET_PATHS.adaptiveForeground, adaptiveMark],
    [BRAND_ASSET_PATHS.adaptiveMonochrome, adaptiveMark],
    [BRAND_ASSET_PATHS.favicon, encodePng(compositeMark(faviconMark, 48, 48))],
    [BRAND_ASSET_PATHS.splash, normalizedMark],
    [BRAND_ASSET_PATHS.playIcon, encodePng(compositeMark(playMark, 512, 512))],
    [
      BRAND_ASSET_PATHS.featureGraphic,
      encodePng(featureGraphic),
    ],
  ]);
}
