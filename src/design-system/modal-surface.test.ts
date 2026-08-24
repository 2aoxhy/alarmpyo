// @ts-expect-error Vitest에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/design-system/modal-surface.tsx'),
  'utf8',
);

describe('공통 중앙 팝업 계약', () => {
  it('중앙 배치와 최상위 표시를 공통으로 적용해요', () => {
    expect(source).toContain("justifyContent: 'center'");
    expect(source).toContain('zIndex: 10_000');
    expect(source).toContain('elevation: 48');
  });

  it('웹 포커스를 가두고 닫은 뒤 이전 조작으로 돌려보내요', () => {
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("event.key !== 'Tab'");
    expect(source).toContain('previousWebFocusRef.current?.focus?.()');
  });

  it('팝업이 겹치면 최상위 팝업만 Escape와 Tab을 처리해요', () => {
    expect(source).toContain('const webModalStack: symbol[] = []');
    expect(source).toContain('if (!isTopModal()) return;');
    expect(source).toContain('webModalStack.splice(stackIndex, 1)');
  });

  it('일반 팝업과 위험 알림의 역할을 구분해요', () => {
    expect(source).toContain("accessibilityRole={alert ? 'alert' : undefined}");
    expect(source).toContain('accessibilityViewIsModal');
  });
});
