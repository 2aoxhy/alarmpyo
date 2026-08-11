/** 일부 편집기가 JSON 맨 앞에 붙이는 UTF-8 BOM 한 글자만 안전하게 제거해요. */
export function stripOptionalUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
