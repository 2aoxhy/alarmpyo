import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_DECODED_BYTES = 128 * 1024 * 1024;
const SUPPORTED_SCREENSHOT_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png']);

export const PLAY_STORE_ASSET_PATHS = Object.freeze({
  featureGraphic: 'assets/play-store/alarmpyo-feature-graphic.png',
  icon: 'assets/play-store/alarmpyo-icon-512.png',
  phoneScreenshots: 'assets/play-store/phone-screenshots',
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

function parsePng(bytes, filePath) {
  ensure(bytes.length >= 45, `${filePath}: PNG 파일이 너무 짧아요.`);
  ensure(
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    `${filePath}: PNG 서명이 올바르지 않아요.`,
  );

  let offset = PNG_SIGNATURE.length;
  let header = null;
  let reachedEnd = false;
  const chunks = [];
  const compressedParts = [];

  while (offset < bytes.length) {
    ensure(
      offset + 12 <= bytes.length,
      `${filePath}: PNG 청크 헤더가 잘렸어요.`,
    );
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    ensure(chunkEnd <= bytes.length, `${filePath}: PNG 청크가 잘렸어요.`);

    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const type = bytes.toString('ascii', typeStart, dataStart);
    ensure(/^[A-Za-z]{4}$/.test(type), `${filePath}: PNG 청크 이름이 잘못됐어요.`);
    ensure(
      crc32(bytes.subarray(typeStart, dataEnd)) === bytes.readUInt32BE(dataEnd),
      `${filePath}: PNG ${type} 청크의 CRC가 손상됐어요.`,
    );
    chunks.push(type);

    if (type === 'IHDR') {
      ensure(header === null, `${filePath}: PNG IHDR 청크가 중복됐어요.`);
      ensure(length === 13, `${filePath}: PNG IHDR 길이가 잘못됐어요.`);
      header = {
        bitDepth: bytes[dataStart + 8],
        colorType: bytes[dataStart + 9],
        compression: bytes[dataStart + 10],
        filter: bytes[dataStart + 11],
        height: bytes.readUInt32BE(dataStart + 4),
        interlace: bytes[dataStart + 12],
        width: bytes.readUInt32BE(dataStart),
      };
    } else if (type === 'IDAT') {
      compressedParts.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      ensure(length === 0, `${filePath}: PNG IEND 길이가 잘못됐어요.`);
      reachedEnd = true;
    }

    offset = chunkEnd;
    if (reachedEnd) break;
  }

  ensure(header !== null, `${filePath}: PNG IHDR 청크가 없어요.`);
  ensure(chunks[0] === 'IHDR', `${filePath}: PNG의 첫 청크가 IHDR이 아니에요.`);
  ensure(reachedEnd, `${filePath}: PNG IEND 청크가 없어요.`);
  ensure(offset === bytes.length, `${filePath}: PNG IEND 뒤에 불필요한 데이터가 있어요.`);
  ensure(compressedParts.length > 0, `${filePath}: PNG IDAT 청크가 없어요.`);
  ensure(header.width > 0 && header.height > 0, `${filePath}: PNG 크기가 잘못됐어요.`);
  ensure(
    header.compression === 0 && header.filter === 0,
    `${filePath}: 지원하지 않는 PNG 압축 또는 필터 방식이에요.`,
  );
  ensure(
    header.interlace === 0 || header.interlace === 1,
    `${filePath}: PNG 인터레이스 값이 잘못됐어요.`,
  );

  const channelsByColorType = new Map([
    [0, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [6, 4],
  ]);
  const channels = channelsByColorType.get(header.colorType);
  ensure(channels !== undefined, `${filePath}: PNG 색상 형식을 지원하지 않아요.`);

  let decoded;
  try {
    decoded = inflateSync(Buffer.concat(compressedParts), {
      maxOutputLength: MAX_PNG_DECODED_BYTES,
    });
  } catch {
    throw new Error(`${filePath}: PNG 압축 픽셀 데이터가 손상됐어요.`);
  }
  ensure(decoded.length > 0, `${filePath}: PNG 픽셀 데이터가 비어 있어요.`);

  if (header.interlace === 0) {
    const rowBytes = Math.ceil(
      (header.width * channels * header.bitDepth) / 8,
    );
    const expectedLength = (rowBytes + 1) * header.height;
    ensure(
      expectedLength <= MAX_PNG_DECODED_BYTES,
      `${filePath}: PNG 픽셀 데이터가 검사 상한을 넘어요.`,
    );
    ensure(
      decoded.length === expectedLength,
      `${filePath}: PNG 픽셀 데이터 길이가 이미지 크기와 맞지 않아요.`,
    );
    for (let row = 0; row < header.height; row += 1) {
      ensure(
        decoded[row * (rowBytes + 1)] <= 4,
        `${filePath}: PNG 행 필터 값이 잘못됐어요.`,
      );
    }
  }

  return {
    ...header,
    byteLength: bytes.length,
    chunks,
    format: 'png',
    hasAlpha: header.colorType === 4 || header.colorType === 6 || chunks.includes('tRNS'),
    hasSrgbProfile: chunks.includes('sRGB'),
    path: filePath,
    pixelDataDecoded: true,
    validationScope: 'png-crc-and-compressed-pixel-data',
  };
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

function findJpegEnd(bytes, offset) {
  for (let index = offset; index + 1 < bytes.length; index += 1) {
    if (bytes[index] !== 0xff) continue;
    const marker = bytes[index + 1];
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 1;
      continue;
    }
    if (marker === 0xd9) return index + 2;
  }
  return -1;
}

function inspectJpegStructure(bytes, filePath) {
  ensure(
    bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8,
    `${filePath}: JPEG 서명이 올바르지 않아요.`,
  );

  let offset = 2;
  let header = null;
  let endOffset = -1;

  while (offset < bytes.length) {
    ensure(bytes[offset] === 0xff, `${filePath}: JPEG 마커가 손상됐어요.`);
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    ensure(offset < bytes.length, `${filePath}: JPEG 마커가 잘렸어요.`);
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) {
      endOffset = offset;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;

    ensure(offset + 2 <= bytes.length, `${filePath}: JPEG 구간 길이가 잘렸어요.`);
    const segmentLength = bytes.readUInt16BE(offset);
    ensure(segmentLength >= 2, `${filePath}: JPEG 구간 길이가 잘못됐어요.`);
    const segmentEnd = offset + segmentLength;
    ensure(segmentEnd <= bytes.length, `${filePath}: JPEG 구간이 잘렸어요.`);

    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      ensure(segmentLength >= 8, `${filePath}: JPEG 크기 구간이 잘렸어요.`);
      header = {
        bitDepth: bytes[offset + 2],
        colorComponents: bytes[offset + 7],
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }

    if (marker === 0xda) {
      endOffset = findJpegEnd(bytes, segmentEnd);
      break;
    }
    offset = segmentEnd;
  }

  ensure(header !== null, `${filePath}: JPEG 크기 정보가 없어요.`);
  ensure(header.width > 0 && header.height > 0, `${filePath}: JPEG 크기가 잘못됐어요.`);
  ensure(endOffset >= 0, `${filePath}: JPEG 종료 마커가 없어요.`);
  ensure(endOffset === bytes.length, `${filePath}: JPEG 종료 뒤에 불필요한 데이터가 있어요.`);

  return {
    ...header,
    byteLength: bytes.length,
    format: 'jpeg',
    hasAlpha: false,
    path: filePath,
    pixelDataDecoded: false,
    validationScope: 'jpeg-structure-and-metadata',
  };
}

export async function inspectPlayStoreImage(filePath) {
  const bytes = await readFile(filePath);
  const extension = extname(filePath).toLowerCase();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    ensure(extension === '.png', `${filePath}: PNG 파일 확장자가 .png가 아니에요.`);
    return { ...parsePng(bytes, filePath), sha256 };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    ensure(
      extension === '.jpg' || extension === '.jpeg',
      `${filePath}: JPEG 파일 확장자가 .jpg 또는 .jpeg가 아니에요.`,
    );
    return { ...inspectJpegStructure(bytes, filePath), sha256 };
  }
  throw new Error(`${filePath}: Google Play에서 지원하는 PNG 또는 JPEG가 아니에요.`);
}

export function findDuplicatePhoneScreenshotPaths(screenshots) {
  const firstPathBySha256 = new Map();
  const duplicates = [];
  for (const screenshot of screenshots) {
    const firstPath = firstPathBySha256.get(screenshot.sha256);
    if (firstPath) duplicates.push([firstPath, screenshot.path]);
    else firstPathBySha256.set(screenshot.sha256, screenshot.path);
  }
  return duplicates;
}

function validateNonInterlacedPng(metadata, label) {
  ensure(
    metadata.interlace === 0,
    `${label}은 PNG 압축 데이터 길이와 행 필터를 결정적으로 검사할 수 있도록 로컬 등록 계약에서 비인터레이스 PNG만 허용해요.`,
  );
}

function validatePngRgb(metadata, label) {
  ensure(
    metadata.format === 'png' &&
      metadata.bitDepth === 8 &&
      metadata.colorType === 2 &&
      metadata.hasAlpha === false,
    `${label}은 24비트 RGB PNG(알파 없음)여야 해요.`,
  );
  validateNonInterlacedPng(metadata, label);
}

function validateJpegRgb(metadata, label) {
  ensure(
    metadata.format === 'jpeg' &&
      metadata.bitDepth === 8 &&
      metadata.colorComponents === 3,
    `${label}의 JPEG는 로컬 등록 계약에서 채널당 8비트 RGB 3채널만 허용해요.`,
  );
}

export function validateOpaquePlayImageMetadata(metadata, label) {
  ensure(
    metadata.format === 'jpeg' || metadata.format === 'png',
    `${label}은 JPEG 또는 PNG여야 해요.`,
  );
  if (metadata.format === 'png') validatePngRgb(metadata, label);
  else validateJpegRgb(metadata, label);
  ensure(metadata.hasAlpha === false, `${label}에는 알파 채널이 없어야 해요.`);
  return true;
}

export function validatePhoneScreenshotMetadata(metadata, label = '휴대전화 스크린샷') {
  validateOpaquePlayImageMetadata(metadata, label);

  const shorter = Math.min(metadata.width, metadata.height);
  const longer = Math.max(metadata.width, metadata.height);
  ensure(shorter >= 320, `${label}의 짧은 변은 320px 이상이어야 해요.`);
  ensure(longer <= 3840, `${label}의 긴 변은 3840px 이하여야 해요.`);
  ensure(
    longer <= shorter * 2,
    `${label}의 긴 변은 짧은 변의 두 배를 넘을 수 없어요.`,
  );
  return true;
}

function isPromotionalScreenshot(metadata) {
  const isLandscape = metadata.width * 9 === metadata.height * 16;
  const isPortrait = metadata.width * 16 === metadata.height * 9;
  return (
    (isLandscape || isPortrait) &&
    Math.min(metadata.width, metadata.height) >= 1080
  );
}

async function listPhoneScreenshotPaths(root) {
  const directory = resolve(root, PLAY_STORE_ASSET_PATHS.phoneScreenshots);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        SUPPORTED_SCREENSHOT_EXTENSIONS.has(extname(entry.name).toLowerCase()),
    )
    .map((entry) => resolve(directory, entry.name))
    .sort((left, right) => left.localeCompare(right, 'en'));
}

export async function validatePlayStoreAssets({
  requirePhoneScreenshots = true,
  root = process.cwd(),
} = {}) {
  const errors = [];
  const warnings = [];
  const assets = { featureGraphic: null, icon: null, phoneScreenshots: [] };

  try {
    const icon = await inspectPlayStoreImage(resolve(root, PLAY_STORE_ASSET_PATHS.icon));
    ensure(icon.format === 'png', 'Play 앱 아이콘은 PNG여야 해요.');
    ensure(icon.width === 512 && icon.height === 512, 'Play 앱 아이콘은 512×512px여야 해요.');
    ensure(
      icon.bitDepth === 8 && icon.colorType === 6,
      'Play 앱 아이콘은 알파 채널이 있는 32비트 PNG여야 해요.',
    );
    validateNonInterlacedPng(icon, 'Play 앱 아이콘');
    ensure(icon.hasSrgbProfile, 'Play 앱 아이콘에는 sRGB 색상 정보가 있어야 해요.');
    ensure(icon.byteLength <= 1024 * 1024, 'Play 앱 아이콘은 1024KB 이하여야 해요.');
    assets.icon = icon;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const featureGraphic = await inspectPlayStoreImage(
      resolve(root, PLAY_STORE_ASSET_PATHS.featureGraphic),
    );
    ensure(
      featureGraphic.width === 1024 && featureGraphic.height === 500,
      'Play 대표 그래픽은 1024×500px여야 해요.',
    );
    validateOpaquePlayImageMetadata(featureGraphic, 'Play 대표 그래픽');
    assets.featureGraphic = featureGraphic;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  let screenshotPaths = [];
  try {
    screenshotPaths = await listPhoneScreenshotPaths(root);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (requirePhoneScreenshots && screenshotPaths.length < 2) {
    errors.push(
      `휴대전화 스크린샷이 ${screenshotPaths.length}장이에요. Play 게시에는 최소 2장이 필요해요.`,
    );
  } else if (screenshotPaths.length === 0) {
    warnings.push('휴대전화 스크린샷이 아직 없어요. Play 게시 전에 최소 2장을 추가해야 해요.');
  }
  if (screenshotPaths.length > 8) {
    errors.push('휴대전화 스크린샷은 최대 8장까지 등록할 수 있어요.');
  }

  for (const screenshotPath of screenshotPaths) {
    try {
      const screenshot = await inspectPlayStoreImage(screenshotPath);
      validatePhoneScreenshotMetadata(screenshot, screenshotPath);
      assets.phoneScreenshots.push(screenshot);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const [firstPath, duplicatePath] of findDuplicatePhoneScreenshotPaths(
    assets.phoneScreenshots,
  )) {
    errors.push(
      `휴대전화 스크린샷 파일 내용이 중복됐어요: ${firstPath}, ${duplicatePath}`,
    );
  }

  const promotionalCount = assets.phoneScreenshots.filter(
    isPromotionalScreenshot,
  ).length;
  if (assets.phoneScreenshots.length > 0 && promotionalCount < 4) {
    warnings.push(
      '추천 노출 형식을 위해 1080px 이상 9:16 또는 16:9 스크린샷을 최소 4장 준비하는 것이 좋아요.',
    );
  }

  const jpegCount = [
    assets.icon,
    assets.featureGraphic,
    ...assets.phoneScreenshots,
  ].filter((asset) => asset?.format === 'jpeg').length;
  if (jpegCount > 0) {
    warnings.push(
      `JPEG ${jpegCount}개는 마커 구조·크기·8비트 RGB 메타데이터만 검사했어요. 엔트로피 픽셀은 디코딩하지 않으므로 Play Console 미리보기에서도 열리는지 확인해야 해요.`,
    );
  }

  return { assets, errors, warnings };
}
