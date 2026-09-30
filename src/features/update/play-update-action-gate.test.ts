import { describe, expect, it } from 'vitest';

import { createPlayUpdateActionGate } from './play-update-action-gate';

describe('Play 업데이트 실행 잠금', () => {
  it('같은 렌더에서 들어온 두 번째 실행을 거부합니다', () => {
    const gate = createPlayUpdateActionGate();
    const first = gate.claim();

    expect(first).not.toBeNull();
    expect(gate.claim()).toBeNull();
    expect(gate.isCurrent(first!)).toBe(true);
  });

  it('오래된 결과와 finally가 새 실행을 해제하지 못하게 합니다', () => {
    const gate = createPlayUpdateActionGate();
    const stale = gate.claim()!;
    gate.invalidate();
    const current = gate.claim()!;

    expect(gate.isCurrent(stale)).toBe(false);
    expect(gate.release(stale)).toBe(false);
    expect(gate.isCurrent(current)).toBe(true);
    expect(gate.release(current)).toBe(true);
  });
});
