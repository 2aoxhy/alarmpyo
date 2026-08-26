// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('공통 행 첫 줄 아이콘 정렬 계약', () => {
  it.each([
    'src/design-system/disclosure-row.tsx',
    'src/design-system/toggle-row.tsx',
  ])('%s는 제목 첫 줄 높이에 아이콘을 맞추고 행 터치 영역을 유지합니다', (path) => {
    const component = source(path);
    expect(component).toContain('const titleLineHeight =');
    expect(component).toContain('styles.mainContent');
    expect(component).toContain('{ height: titleLineHeight }');
    expect(component).toContain('minHeight: 68');
    expect(component).toContain("alignItems: 'flex-start'");
  });

  it('상태 배너는 제목 유무에 맞는 첫 줄 높이를 사용합니다', () => {
    const banner = source('src/design-system/status-banner.tsx');
    expect(banner).toContain('const firstLineHeight =');
    expect(banner).toContain('title ? typeScale.label.lineHeight : typeScale.body.lineHeight');
    expect(banner).toContain('{ height: firstLineHeight }');
    expect(banner).toContain("alignItems: 'flex-start'");
  });

  it('기존 ListRow도 아이콘과 제목을 같은 내부 행으로 묶습니다', () => {
    const uiKit = source('src/components/ui-kit.tsx');
    expect(uiKit).toContain('styles.listRowMain');
    expect(uiKit).toContain('styles.listRowIcon, { height: titleLineHeight }');
    expect(uiKit).toContain('minHeight: 68');
  });
});
