import { describe, expect, it, vi } from 'vitest';

import { createAppSelectorSource } from './app-selector-source';

describe('createAppSelectorSource', () => {
  it('notifies only selectors whose result changed', () => {
    const source = createAppSelectorSource({ data: 1, status: 'idle' });
    const dataSubscription = source.createSubscription((state) => state.data);
    const statusSubscription = source.createSubscription((state) => state.status);
    const dataListener = vi.fn();
    const statusListener = vi.fn();
    dataSubscription.subscribe(dataListener);
    statusSubscription.subscribe(statusListener);

    source.setSnapshot({ data: 1, status: 'saving' });

    expect(dataListener).not.toHaveBeenCalled();
    expect(statusListener).toHaveBeenCalledTimes(1);
    expect(statusSubscription.getSnapshot()).toBe('saving');
  });

  it('supports semantic equality for projection-based consumers', () => {
    const source = createAppSelectorSource({
      data: { scheduleSignature: 'A', unrelated: 1 },
    });
    const subscription = source.createSubscription(
      (state) => state.data,
      (previous, next) =>
        previous.scheduleSignature === next.scheduleSignature,
    );
    const listener = vi.fn();
    subscription.subscribe(listener);

    source.setSnapshot({ data: { scheduleSignature: 'A', unrelated: 2 } });
    expect(listener).not.toHaveBeenCalled();
    expect(subscription.getSnapshot().unrelated).toBe(1);

    source.setSnapshot({ data: { scheduleSignature: 'B', unrelated: 3 } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(subscription.getSnapshot()).toEqual({
      scheduleSignature: 'B',
      unrelated: 3,
    });
  });

  it('stops notifications after the subscription is destroyed', () => {
    const source = createAppSelectorSource({ value: 1 });
    const subscription = source.createSubscription((state) => state.value);
    const listener = vi.fn();
    subscription.subscribe(listener);
    subscription.destroy();

    source.setSnapshot({ value: 2 });

    expect(listener).not.toHaveBeenCalled();
  });
});
