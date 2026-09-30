// @ts-expect-error Vitest에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/design-system/async-state.tsx'),
  'utf8',
);

describe('비동기 상태 공통 화면', () => {
  it('상태 안내와 다시 시도를 서로 다른 접근성 대상으로 유지해요', () => {
    expect(source).toContain('style={styles.status}');
    expect(source).toContain("kind === 'error' && onRetry");
    expect(source).toContain('onPress={onRetry}');
    expect(source).not.toContain('<View\n      accessible');
  });
});
