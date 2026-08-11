export function getUtf8ByteLength(value: string): number {
  let size = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) size += 1;
    else if (code <= 0x7ff) size += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        size += 4;
        index += 1;
      } else {
        size += 3;
      }
    } else size += 3;
  }
  return size;
}
