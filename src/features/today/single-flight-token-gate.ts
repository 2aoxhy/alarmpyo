export type SingleFlightTokenGate = {
  claim: () => number | null;
  release: (token: number) => boolean;
};

/**
 * Claims an operation synchronously, before React can commit another render.
 * Only the owner token can release the gate, so a stale async completion can
 * never unlock a newer operation.
 */
export function createSingleFlightTokenGate(): SingleFlightTokenGate {
  let nextToken = 0;
  let activeToken: number | null = null;

  return {
    claim() {
      if (activeToken !== null) return null;
      activeToken = ++nextToken;
      return activeToken;
    },
    release(token) {
      if (activeToken !== token) return false;
      activeToken = null;
      return true;
    },
  };
}
