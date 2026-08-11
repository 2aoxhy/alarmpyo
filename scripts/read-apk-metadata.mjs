import { Buffer } from 'node:buffer';
import { createHash, X509Certificate } from 'node:crypto';
import { open } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const STRING_POOL_TYPE = 0x0001;
const START_ELEMENT_TYPE = 0x0102;
const UTF8_FLAG = 0x00000100;
const APK_SIGNING_BLOCK_MAGIC = Buffer.from('APK Sig Block 42', 'ascii');
const APK_SIGNATURE_SCHEME_IDS = new Set([
  0x7109871a, // v2
  0xf05368c0, // v3
  0x1b93ad61, // v3.1
]);

function readLength8(buffer, offset) {
  const first = buffer[offset];
  return first & 0x80
    ? { length: ((first & 0x7f) << 8) | buffer[offset + 1], bytes: 2 }
    : { length: first, bytes: 1 };
}

function readLength16(buffer, offset) {
  const first = buffer.readUInt16LE(offset);
  return first & 0x8000
    ? {
        length: ((first & 0x7fff) << 16) | buffer.readUInt16LE(offset + 2),
        bytes: 4,
      }
    : { length: first, bytes: 2 };
}

function parseStringPool(buffer, chunkOffset) {
  const headerSize = buffer.readUInt16LE(chunkOffset + 2);
  const stringCount = buffer.readUInt32LE(chunkOffset + 8);
  const flags = buffer.readUInt32LE(chunkOffset + 16);
  const stringsStart = buffer.readUInt32LE(chunkOffset + 20);
  const utf8 = (flags & UTF8_FLAG) !== 0;
  const strings = [];
  for (let index = 0; index < stringCount; index += 1) {
    const relativeOffset = buffer.readUInt32LE(chunkOffset + headerSize + index * 4);
    let cursor = chunkOffset + stringsStart + relativeOffset;
    if (utf8) {
      const utf16Length = readLength8(buffer, cursor);
      cursor += utf16Length.bytes;
      const byteLength = readLength8(buffer, cursor);
      cursor += byteLength.bytes;
      strings.push(buffer.toString('utf8', cursor, cursor + byteLength.length));
    } else {
      const charLength = readLength16(buffer, cursor);
      cursor += charLength.bytes;
      strings.push(buffer.toString('utf16le', cursor, cursor + charLength.length * 2));
    }
  }
  return strings;
}

function typedAttributeValue(buffer, offset, strings) {
  const rawValueIndex = buffer.readUInt32LE(offset + 8);
  if (rawValueIndex !== 0xffffffff) return strings[rawValueIndex] ?? null;
  const dataType = buffer[offset + 15];
  const data = buffer.readUInt32LE(offset + 16);
  if (dataType === 0x03) return strings[data] ?? null;
  if (dataType === 0x10 || dataType === 0x11) return data;
  return null;
}

export function parseAndroidManifestMetadata(buffer) {
  const prefix = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').trimStart();
  if (prefix.startsWith('<')) {
    const xml = buffer.toString('utf8');
    const manifest = xml.match(/<manifest\b[^>]*>/i)?.[0] ?? '';
    const attribute = (name) =>
      manifest.match(new RegExp(`(?:android:)?${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ??
      null;
    const versionCode = Number(attribute('versionCode'));
    return {
      packageName: attribute('package'),
      versionCode: Number.isSafeInteger(versionCode) ? versionCode : null,
      versionName: attribute('versionName'),
    };
  }

  let strings = null;
  let offset = buffer.readUInt16LE(2);
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.readUInt16LE(offset);
    const headerSize = buffer.readUInt16LE(offset + 2);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (headerSize < 8 || chunkSize < headerSize || offset + chunkSize > buffer.length) {
      break;
    }
    if (chunkType === STRING_POOL_TYPE) {
      strings = parseStringPool(buffer, offset);
    } else if (chunkType === START_ELEMENT_TYPE && strings) {
      const elementName = strings[buffer.readUInt32LE(offset + 20)];
      if (elementName === 'manifest') {
        const attributeStart = buffer.readUInt16LE(offset + 24);
        const attributeSize = buffer.readUInt16LE(offset + 26);
        const attributeCount = buffer.readUInt16LE(offset + 28);
        const attributesOffset = offset + 16 + attributeStart;
        const values = new Map();
        for (let index = 0; index < attributeCount; index += 1) {
          const attributeOffset = attributesOffset + index * attributeSize;
          const name = strings[buffer.readUInt32LE(attributeOffset + 4)];
          values.set(name, typedAttributeValue(buffer, attributeOffset, strings));
        }
        const versionCode = Number(values.get('versionCode'));
        return {
          packageName:
            typeof values.get('package') === 'string' ? values.get('package') : null,
          versionCode: Number.isSafeInteger(versionCode) ? versionCode : null,
          versionName:
            typeof values.get('versionName') === 'string'
              ? values.get('versionName')
              : null,
        };
      }
    }
    offset += chunkSize;
  }
  throw new Error('AndroidManifest.xml에서 앱 정보를 읽지 못했어요.');
}

async function readExact(handle, length, position) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new Error('APK 파일을 끝까지 읽지 못했어요.');
  return buffer;
}

async function readZipEntry(apkPath, entryName) {
  const handle = await open(apkPath, 'r');
  try {
    const stat = await handle.stat();
    const tailLength = Math.min(stat.size, 0xffff + 22);
    const tail = await readExact(handle, tailLength, stat.size - tailLength);
    let eocdOffset = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        eocdOffset = index;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error('APK ZIP 정보를 찾지 못했어요.');
    const centralSize = tail.readUInt32LE(eocdOffset + 12);
    const centralOffset = tail.readUInt32LE(eocdOffset + 16);
    const central = await readExact(handle, centralSize, centralOffset);
    let cursor = 0;
    while (cursor + 46 <= central.length) {
      if (central.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) break;
      const compression = central.readUInt16LE(cursor + 10);
      const compressedSize = central.readUInt32LE(cursor + 20);
      const uncompressedSize = central.readUInt32LE(cursor + 24);
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      const localOffset = central.readUInt32LE(cursor + 42);
      const name = central.toString('utf8', cursor + 46, cursor + 46 + nameLength);
      if (name === entryName) {
        const local = await readExact(handle, 30, localOffset);
        if (local.readUInt32LE(0) !== LOCAL_SIGNATURE) {
          throw new Error('APK 항목 위치가 올바르지 않아요.');
        }
        const localNameLength = local.readUInt16LE(26);
        const localExtraLength = local.readUInt16LE(28);
        const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = await readExact(handle, compressedSize, dataOffset);
        const contents = compression === 0
          ? compressed
          : compression === 8
            ? inflateRawSync(compressed)
            : null;
        if (!contents || contents.length !== uncompressedSize) {
          throw new Error('APK 항목 압축을 해제하지 못했어요.');
        }
        return contents;
      }
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error(`${entryName}을 APK에서 찾지 못했어요.`);
  } finally {
    await handle.close();
  }
}

export async function readApkMetadata(apkPath) {
  return parseAndroidManifestMetadata(
    await readZipEntry(apkPath, 'AndroidManifest.xml'),
  );
}

function readLengthPrefixed(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) {
    throw new Error('APK 서명 길이 정보를 읽을 수 없어요.');
  }
  const length = buffer.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + length;
  if (length < 1 || end > buffer.length) {
    throw new Error('APK 서명 길이 정보가 올바르지 않아요.');
  }
  return { value: buffer.subarray(start, end), nextOffset: end };
}

export function readSignerCertificatesFromSchemeBlock(schemeBlock) {
  const signers = readLengthPrefixed(schemeBlock, 0).value;
  const certificates = [];
  let signerOffset = 0;
  while (signerOffset < signers.length) {
    const signer = readLengthPrefixed(signers, signerOffset);
    signerOffset = signer.nextOffset;
    const signedData = readLengthPrefixed(signer.value, 0).value;
    const digests = readLengthPrefixed(signedData, 0);
    const certificateSequence = readLengthPrefixed(
      signedData,
      digests.nextOffset,
    ).value;
    let certificateOffset = 0;
    while (certificateOffset < certificateSequence.length) {
      const certificate = readLengthPrefixed(
        certificateSequence,
        certificateOffset,
      );
      certificates.push(certificate.value);
      certificateOffset = certificate.nextOffset;
    }
  }
  return certificates;
}

/**
 * APK v2/v3 서명 블록에 포함된 X.509 인증서의 SHA-256을 읽어요.
 * 외부 Android SDK 도구가 없는 빌드 환경에서도 운영 서명을 검증할 수 있어요.
 */
export async function readApkSigningCertificateSha256(apkPath) {
  const handle = await open(apkPath, 'r');
  try {
    const stats = await handle.stat();
    const tailLength = Math.min(stats.size, 0xffff + 22);
    const tail = await readExact(handle, tailLength, stats.size - tailLength);
    let eocdOffset = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        eocdOffset = index;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error('APK ZIP 정보를 찾지 못했어요.');

    const centralOffset = tail.readUInt32LE(eocdOffset + 16);
    if (centralOffset < 32) throw new Error('APK 서명 블록이 없어요.');
    const footer = await readExact(handle, 24, centralOffset - 24);
    if (!footer.subarray(8).equals(APK_SIGNING_BLOCK_MAGIC)) {
      throw new Error('APK v2/v3 서명 블록을 찾지 못했어요.');
    }

    const blockSizeBigInt = footer.readBigUInt64LE(0);
    if (blockSizeBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('APK 서명 블록이 너무 커요.');
    }
    const blockSize = Number(blockSizeBigInt);
    const blockStart = centralOffset - blockSize - 8;
    if (blockStart < 0) throw new Error('APK 서명 블록 위치가 올바르지 않아요.');
    const header = await readExact(handle, 8, blockStart);
    if (header.readBigUInt64LE(0) !== blockSizeBigInt) {
      throw new Error('APK 서명 블록의 크기가 일치하지 않아요.');
    }

    const pairsLength = blockSize - 24;
    if (pairsLength < 12) throw new Error('APK 서명 정보가 비어 있어요.');
    const pairs = await readExact(handle, pairsLength, blockStart + 8);
    const certificateDigests = new Set();
    let offset = 0;
    while (offset < pairs.length) {
      if (offset + 12 > pairs.length) {
        throw new Error('APK 서명 항목이 잘렸어요.');
      }
      const pairSizeBigInt = pairs.readBigUInt64LE(offset);
      if (
        pairSizeBigInt < 4n ||
        pairSizeBigInt > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        throw new Error('APK 서명 항목 크기가 올바르지 않아요.');
      }
      const pairSize = Number(pairSizeBigInt);
      const pairEnd = offset + 8 + pairSize;
      if (pairEnd > pairs.length) {
        throw new Error('APK 서명 항목이 파일 범위를 벗어났어요.');
      }
      const id = pairs.readUInt32LE(offset + 8);
      if (APK_SIGNATURE_SCHEME_IDS.has(id)) {
        const schemeBlock = pairs.subarray(offset + 12, pairEnd);
        for (const certificate of readSignerCertificatesFromSchemeBlock(
          schemeBlock,
        )) {
          // DER 파싱을 먼저 실행해 손상된 인증서가 지문으로 승인되지 않게 해요.
          new X509Certificate(certificate);
          certificateDigests.add(
            createHash('sha256').update(certificate).digest('hex'),
          );
        }
      }
      offset = pairEnd;
    }
    if (certificateDigests.size === 0) {
      throw new Error('APK 서명 인증서를 찾지 못했어요.');
    }
    return [...certificateDigests].toSorted();
  } finally {
    await handle.close();
  }
}
