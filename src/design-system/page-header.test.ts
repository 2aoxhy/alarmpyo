// @ts-expect-error Vitest에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/design-system/page-header.tsx'),
  'utf8',
);
const patternSource = readFileSync(
  resolve(process.cwd(), 'src/app/pattern.tsx'),
  'utf8',
);

describe('페이지 제목 중심축', () => {
  it('인라인 제목 양쪽에 같은 가변 슬롯과 48dp 최소 터치 영역을 유지해요', () => {
    expect(source).toContain('styles.leadingSide');
    expect(source).toContain('styles.trailingSide');
    expect(source).toContain('flex: 1');
    expect(source).toContain('minWidth: 48');
    expect(source).toContain('width: 48');
    expect(source).toContain('minHeight: 48');
  });

  it('좁은 화면과 큰 글자에서는 우측 동작을 별도 행으로 내려요', () => {
    expect(source).toContain(
      'return hasTrailingAction && (width < 360 || fontScale >= 1.3);',
    );
    expect(source).toContain(
      'shouldStackPageHeaderAction(width, fontScale, trailing != null)',
    );
    expect(source).toContain('<View style={styles.actionRow}>{trailing}</View>');
    expect(patternSource).toMatch(
      /<PageHeader[\s\S]*?trailing=\{[\s\S]*?label="보관함"[\s\S]*?size="compact"/,
    );
  });
});
