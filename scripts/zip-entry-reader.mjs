import { Buffer } from 'node:buffer';
import { open } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

async function readExact(handle, length, position) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new Error('AAB ZIP 파일을 끝까지 읽지 못했어요.');
  return buffer;
}

export async function readZipEntries(filePath, predicate) {
  const handle = await open(filePath, 'r');
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
    if (eocdOffset < 0) throw new Error('AAB ZIP 목차를 찾지 못했어요.');

    const centralSize = tail.readUInt32LE(eocdOffset + 12);
    const centralOffset = tail.readUInt32LE(eocdOffset + 16);
    const central = await readExact(handle, centralSize, centralOffset);
    const entries = [];
    let cursor = 0;
    while (cursor + 46 <= central.length) {
      if (central.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
        throw new Error('AAB ZIP 목차가 손상됐어요.');
      }
      const compression = central.readUInt16LE(cursor + 10);
      const compressedSize = central.readUInt32LE(cursor + 20);
      const uncompressedSize = central.readUInt32LE(cursor + 24);
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      const localOffset = central.readUInt32LE(cursor + 42);
      const name = central.toString('utf8', cursor + 46, cursor + 46 + nameLength);

      if (predicate(name)) {
        const local = await readExact(handle, 30, localOffset);
        if (local.readUInt32LE(0) !== LOCAL_SIGNATURE) {
          throw new Error(`AAB ZIP 항목 위치가 올바르지 않아요: ${name}`);
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
          throw new Error(`AAB ZIP 항목을 해제하지 못했어요: ${name}`);
        }
        entries.push({ name, contents });
      }
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    await handle.close();
  }
}
