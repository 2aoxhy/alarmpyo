import { describe, expect, it } from 'vitest';

import { stripOptionalUtf8Bom } from '../json';

describe('JSON BOM 정리', () => {
  it('맨 앞의 UTF-8 BOM 한 글자만 제거해요', () => {
    expect(stripOptionalUtf8Bom('\uFEFF{"ok":true}')).toBe('{"ok":true}');
    expect(stripOptionalUtf8Bom('{"ok":true}')).toBe('{"ok":true}');
  });
});
