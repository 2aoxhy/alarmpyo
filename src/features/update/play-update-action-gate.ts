export type PlayUpdateActionGate = {
  claim: () => number | null;
  invalidate: () => void;
  isCurrent: (revision: number) => boolean;
  release: (revision: number) => boolean;
};

export function createPlayUpdateActionGate(): PlayUpdateActionGate {
  let nextRevision = 0;
  let activeRevision: number | null = null;

  return {
    claim() {
      if (activeRevision !== null) return null;
      activeRevision = ++nextRevision;
      return activeRevision;
    },
    invalidate() {
      nextRevision += 1;
      activeRevision = null;
    },
    isCurrent(revision) {
      return activeRevision === revision;
    },
    release(revision) {
      if (activeRevision !== revision) return false;
      activeRevision = null;
      return true;
    },
  };
}
