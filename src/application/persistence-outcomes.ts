export type PersistedMutationOutcome = {
  operationSucceeded: boolean;
  announceSuccess: boolean;
  partialFailure: boolean;
};

export type SnapshotPersistenceOutcome = PersistedMutationOutcome & {
  primarySaved: boolean;
  lastKnownGoodSaved: boolean;
};

export function getPersistedMutationOutcome(
  dataSaved: boolean,
  followUpSucceeded: boolean,
): PersistedMutationOutcome {
  return {
    operationSucceeded: dataSaved,
    announceSuccess: dataSaved && followUpSucceeded,
    partialFailure: dataSaved && !followUpSucceeded,
  };
}

export function getSnapshotPersistenceOutcome(
  primarySaved: boolean,
  lastKnownGoodSaved: boolean,
): SnapshotPersistenceOutcome {
  return {
    primarySaved,
    lastKnownGoodSaved,
    ...getPersistedMutationOutcome(primarySaved, lastKnownGoodSaved),
  };
}
