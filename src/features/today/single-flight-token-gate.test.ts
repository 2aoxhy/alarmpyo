import { describe, expect, it } from 'vitest';

import { createSingleFlightTokenGate } from './single-flight-token-gate';

describe('createSingleFlightTokenGate', () => {
  it('blocks a second launch until the active token releases it', () => {
    const gate = createSingleFlightTokenGate();
    const firstToken = gate.claim();

    expect(firstToken).toBe(1);
    expect(gate.claim()).toBeNull();
    expect(gate.release(firstToken!)).toBe(true);
    expect(gate.claim()).toBe(2);
  });

  it('does not let a stale token release the active launch', () => {
    const gate = createSingleFlightTokenGate();
    const activeToken = gate.claim();

    expect(gate.release(999)).toBe(false);
    expect(gate.claim()).toBeNull();
    expect(gate.release(activeToken!)).toBe(true);
  });
});
