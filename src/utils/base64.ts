const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_DECODE_TABLE = (() => {
  const table = new Int16Array(128);
  table.fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

export function getBase64DecodedByteLength(value: string): number {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error('Base64 형식이 올바르지 않습니다.');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  if (padding === 2) {
    const lastDataValue = decodeBase64Character(value.charCodeAt(value.length - 3));
    if ((lastDataValue & 0x0f) !== 0) throw new Error('Base64 형식이 올바르지 않습니다.');
  } else if (padding === 1) {
    const lastDataValue = decodeBase64Character(value.charCodeAt(value.length - 2));
    if ((lastDataValue & 0x03) !== 0) throw new Error('Base64 형식이 올바르지 않습니다.');
  }
  return (value.length / 4) * 3 - padding;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  const chunks: string[] = [];
  const chunkByteLength = 12_288;
  for (let offset = 0; offset < bytes.length; offset += chunkByteLength) {
    const end = Math.min(bytes.length, offset + chunkByteLength);
    let chunk = '';
    for (let index = offset; index < end; index += 3) {
      const first = bytes[index]!;
      const hasSecond = index + 1 < bytes.length;
      const hasThird = index + 2 < bytes.length;
      const second = hasSecond ? bytes[index + 1]! : 0;
      const third = hasThird ? bytes[index + 2]! : 0;
      const value = (first << 16) | (second << 8) | third;
      chunk +=
        BASE64_ALPHABET[(value >>> 18) & 63] +
        BASE64_ALPHABET[(value >>> 12) & 63] +
        (hasSecond ? BASE64_ALPHABET[(value >>> 6) & 63] : '=') +
        (hasThird ? BASE64_ALPHABET[value & 63] : '=');
    }
    chunks.push(chunk);
  }
  return chunks.join('');
}

export function base64ToBytes(value: string, maximumBytes?: number): Uint8Array {
  const byteLength = getBase64DecodedByteLength(value);
  if (maximumBytes !== undefined && byteLength > maximumBytes) {
    throw new Error('Base64 데이터가 허용된 크기를 넘었습니다.');
  }

  const output = new Uint8Array(byteLength);
  let outputIndex = 0;
  for (let index = 0; index < value.length; index += 4) {
    const first = decodeBase64Character(value.charCodeAt(index));
    const second = decodeBase64Character(value.charCodeAt(index + 1));
    const thirdCharacter = value.charCodeAt(index + 2);
    const fourthCharacter = value.charCodeAt(index + 3);
    const third = thirdCharacter === 61 ? 0 : decodeBase64Character(thirdCharacter);
    const fourth = fourthCharacter === 61 ? 0 : decodeBase64Character(fourthCharacter);
    const block = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (outputIndex < byteLength) output[outputIndex++] = (block >>> 16) & 0xff;
    if (outputIndex < byteLength) output[outputIndex++] = (block >>> 8) & 0xff;
    if (outputIndex < byteLength) output[outputIndex++] = block & 0xff;
  }
  return output;
}

function decodeBase64Character(character: number): number {
  if (character >= BASE64_DECODE_TABLE.length) {
    throw new Error('Base64 형식이 올바르지 않습니다.');
  }
  const decoded = BASE64_DECODE_TABLE[character]!;
  if (decoded < 0) throw new Error('Base64 형식이 올바르지 않습니다.');
  return decoded;
}
