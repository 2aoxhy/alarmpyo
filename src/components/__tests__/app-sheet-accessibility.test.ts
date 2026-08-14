// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sheet = readFileSync(
  resolve(process.cwd(), 'src/components/app-sheet.tsx'),
  'utf8',
);

describe('공통 하단 시트 접근성 계약', () => {
  it('본문 화면 높이를 바꾸지 않는 모달과 스크롤 영역을 사용해요', () => {
    expect(sheet).toContain('<Modal');
    expect(sheet).toContain('accessibilityViewIsModal');
    expect(sheet).toContain('<ScrollView');
    expect(sheet).toContain("maxHeight: '86%'");
  });

  it('웹 Tab 포커스를 가두고 Escape와 닫기 뒤 원래 조작으로 돌아가요', () => {
    expect(sheet).toContain("event.key === 'Escape'");
    expect(sheet).toContain("event.key !== 'Tab'");
    expect(sheet).toContain('WEB_FOCUSABLE_SELECTOR');
    expect(sheet).toContain("titleNode?.setAttribute?.('tabindex', '-1')");
    expect(sheet).toContain('previousWebFocusRef.current?.focus?.()');
    expect(sheet).toContain('AccessibilityInfo.setAccessibilityFocus(node)');
    expect(sheet).toContain('returnFocusRef?.current');
  });
});
