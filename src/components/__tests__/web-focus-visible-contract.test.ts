// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('웹 키보드 포커스 접근성 계약', () => {
  it('공통 버튼과 목록 행에 focus-visible 외곽선을 연결해요', () => {
    const uiKit = source('src/components/ui-kit.tsx');

    expect(uiKit).toContain('const buttonFocus = useWebFocusVisible();');
    expect(uiKit).toContain('const rowFocus = useWebFocusVisible();');
    expect(uiKit).toContain('buttonFocus.focusVisible && !blocked && styles.webFocusVisible');
    expect(uiKit).toContain(
      'rowFocus.focusVisible && onPress && !disabled && !loading && styles.webFocusVisible',
    );
  });

  it('저장 오류 배너의 직접 조작 세 곳에도 같은 포커스 표시를 제공해요', () => {
    const banner = source('src/components/save-error-banner.tsx');

    for (const control of [
      'closeButtonFocus',
      'collapsedSummaryFocus',
      'collapsedRetryFocus',
    ]) {
      expect(banner).toContain(`const ${control} = useWebFocusVisible();`);
      expect(banner).toContain(`onBlur={${control}.onBlur}`);
      expect(banner).toContain(`onFocus={${control}.onFocus}`);
    }
  });

  it('외곽선은 웹에서만 의미 기반 focus 색상과 2px 너비를 사용해요', () => {
    const uiKit = source('src/components/ui-kit.tsx');
    const banner = source('src/components/save-error-banner.tsx');
    const hook = source('src/hooks/use-web-focus-visible.ts');

    for (const component of [uiKit, banner]) {
      expect(component).toContain("Platform.OS === 'web'");
      expect(component).toContain('createSemanticColors(palette, isDark).focus');
      expect(component).toContain("outlineStyle: 'solid'");
      expect(component).toContain('outlineWidth: 2');
    }
    expect(hook).toContain("matches.call(target, ':focus-visible')");
    expect(hook).toContain("if (Platform.OS !== 'web') return;");
  });
});
