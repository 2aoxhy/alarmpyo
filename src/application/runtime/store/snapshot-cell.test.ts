import { describe, expect, it, vi } from 'vitest';
import { AppStoreSnapshotCell } from './snapshot-cell';

describe('AppStoreSnapshotCell', () => {
  it('copies caller-owned input before freezing while structurally sharing unchanged branches', () => {
    const caller = { data: { nested: { count: 1 }, other: ['day', 'night'] }, status: 'idle' };
    const cell = new AppStoreSnapshotCell(caller);
    expect(Object.isFrozen(caller)).toBe(false);
    expect(Object.isFrozen(caller.data)).toBe(false);
    caller.data.nested.count = 10;
    expect(cell.getSnapshot().data.nested.count).toBe(1);
    const before = cell.getSnapshot();
    const edit = { nested: { count: 2 }, other: ['day', 'night'] };
    cell.set('data', edit);
    expect(Object.isFrozen(edit.nested)).toBe(false);
    expect(cell.getSnapshot().data.other).toBe(before.data.other);
    expect(Object.isFrozen(cell.getSnapshot().data.nested)).toBe(true);
  });

  it('makes the latest snapshot visible immediately and batches synchronous notifications', async () => {
    const cell = new AppStoreSnapshotCell({ count: 0, status: 'idle' });
    const listener = vi.fn();
    cell.subscribe(listener);
    cell.set('count', 1);
    cell.set('status', 'saved');
    expect(cell.getSnapshot()).toEqual({ count: 1, status: 'saved' });
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = cell.getSnapshot();
    cell.set('count', 1);
    await Promise.resolve();
    expect(cell.getSnapshot()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
