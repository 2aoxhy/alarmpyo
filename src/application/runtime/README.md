# Runtime ownership

`AppStoreEngine` is the single application state owner. React's store provider only
attaches lifecycle and `useSyncExternalStore` subscriptions. Commands are stable;
snapshots are immutable and preserve unchanged branch identities.

- `store/boot-coordinator.ts`: cold load, recovery discovery and pending cleanup.
- `store/persistence-coordinator.ts`: primary-first saves, partial outcomes and autosave.
- `store/restore-coordinator.ts`: import, backup, restore and reset transactions.
- `store/runtime-coordinator.ts`: alarm/sleep synchronization and permission commands.
- `store/pattern-coordinator.ts`: pattern application/deletion with safety backup and rollback.
- `store/commands-coordinator.ts`: validated schedule/settings mutations.
- `store/lifecycle-coordinator.ts`: debounce, foreground and background scheduling.
- `store/widget-coordinator.ts`: signature-gated widget projection and delivery.

All data mutations, boot/recovery and alarm/sleep synchronization use one
`AppStoreMutationQueue`. Internal transaction steps never re-enter that queue.
Widget delivery is an independent, cancellable projection; it cannot write AppData.

The application-owned `AppStoreStoragePort` hides repository keys, serialized
writer operations, last-known-good copies and restore journal representation.
`AppDataCodecPort` hides migration/validation/serialization. Their infrastructure
adapters bind the established algorithms to one repository/writer per engine.
AppData v21, backup JSON and native wire formats are unchanged.

The pure legacy `services` modules reached by this engine are calculation policies
(schedule, alarm, sleep, widget, pattern and work-setting transformations), not
device services. `app-store-boundary.test.ts` traverses their emitted runtime imports
and rejects transitive React, Expo, infrastructure, feature, route or store imports.
The old app-data, storage and alarm-runner facades remain only for compatibility;
the engine does not depend on those facades.

## Preserved failure semantics

1. Primary storage must succeed before edited data is visible.
2. LKG/device-backup/native failure after primary success retains the committed data
   and reports a partial outcome; autosave does not erase that error.
3. Alarm OFF is committed before native `cancelAll`; failure never re-enables it.
4. Restore protection is prepared before replacement. Journal inspection is read-only;
   corrupt repair is explicitly requested under the same mutation queue.
5. Stop invalidates async session responses. An already-started primary write may
   finish safely; restart reads that durable result rather than publishing stale status.

The integration tests bind real codecs/storage algorithms to fake device ports and
cover ordering, failure paths, stop/start epochs and unrelated-slice notifications.
