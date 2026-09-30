/** A revision belongs to one effect lifecycle, not merely one component ref. */
export type TimerObservationRevision = Readonly<{
  generation: number;
  revision: number;
}>;

/**
 * Guards publication independently from the serialized native operation queue.
 * Accepted commands finish even if their screen closes; only the current screen
 * lifecycle may publish their result or announce it.
 */
export function createQuickTimerObservationSession() {
  let active = false;
  let generation = 0;
  let revision = 0;
  let action: TimerObservationRevision | null = null;

  const nextRevision = (): TimerObservationRevision => ({
    generation,
    revision: ++revision,
  });
  const isCurrent = (token: TimerObservationRevision) =>
    active && token.generation === generation && token.revision === revision;

  return {
    activate() {
      active = true;
      generation += 1;
      action = null;
    },
    deactivate() {
      active = false;
      generation += 1;
      action = null;
    },
    isCurrent,
    hasPendingAction: () => action !== null,
    claimAction(): TimerObservationRevision | null {
      if (!active || action !== null) return null;
      action = nextRevision();
      return action;
    },
    beginObservation(
      claimedAction?: TimerObservationRevision,
    ): TimerObservationRevision | null {
      if (claimedAction !== undefined) {
        return action === claimedAction && isCurrent(claimedAction)
          ? claimedAction
          : null;
      }
      return active && action === null ? nextRevision() : null;
    },
    releaseAction(token: TimerObservationRevision): boolean {
      if (action !== token || !isCurrent(token)) return false;
      action = null;
      return true;
    },
  };
}
