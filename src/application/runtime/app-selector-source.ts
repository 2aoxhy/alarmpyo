export type AppSelector<TState, TSelected> = (state: TState) => TSelected;
export type AppSelectorEquality<TSelected> = (
  previous: TSelected,
  next: TSelected,
) => boolean;

export type AppSelectorSubscription<TSelected> = {
  getSnapshot: () => TSelected;
  subscribe: (listener: () => void) => () => void;
  destroy: () => void;
};

type InternalSubscription<TState, TSelected> = {
  selector: AppSelector<TState, TSelected>;
  equality: AppSelectorEquality<TSelected>;
  selected: TSelected;
  selectedVersion: number;
  listeners: Set<() => void>;
  destroyed: boolean;
};

export type AppSelectorSource<TState> = {
  getSnapshot: () => TState;
  setSnapshot: (state: TState) => void;
  createSubscription: <TSelected>(
    selector: AppSelector<TState, TSelected>,
    equality?: AppSelectorEquality<TSelected>,
  ) => AppSelectorSubscription<TSelected>;
};

/**
 * Minimal selector-aware external store. Each subscription is notified only
 * when its selected value changes, so unrelated AppData/status updates do not
 * force migrated consumers to render again.
 */
export function createAppSelectorSource<TState>(
  initialState: TState,
): AppSelectorSource<TState> {
  let state = initialState;
  let version = 0;
  const subscriptions = new Set<InternalSubscription<TState, unknown>>();

  const refreshSelected = (
    subscription: InternalSubscription<TState, unknown>,
  ) => {
    if (
      subscription.destroyed ||
      subscription.selectedVersion === version
    ) {
      return false;
    }

    const nextSelected = subscription.selector(state);
    const changed = !subscription.equality(
      subscription.selected,
      nextSelected,
    );
    if (changed) subscription.selected = nextSelected;
    subscription.selectedVersion = version;
    return changed;
  };

  return {
    getSnapshot: () => state,
    setSnapshot(nextState) {
      if (Object.is(state, nextState)) return;
      state = nextState;
      version += 1;
      for (const subscription of subscriptions) {
        if (!refreshSelected(subscription)) continue;
        for (const listener of subscription.listeners) listener();
      }
    },
    createSubscription<TSelected>(
      selector: AppSelector<TState, TSelected>,
      equality: AppSelectorEquality<TSelected> = Object.is,
    ) {
      const subscription: InternalSubscription<TState, TSelected> = {
        selector,
        equality,
        selected: selector(state),
        selectedVersion: version,
        listeners: new Set(),
        destroyed: false,
      };
      const sourceSubscription =
        subscription as InternalSubscription<TState, unknown>;
      return {
        getSnapshot: () => {
          refreshSelected(sourceSubscription);
          return subscription.selected;
        },
        subscribe(listener) {
          if (subscription.destroyed) return () => undefined;
          refreshSelected(sourceSubscription);
          subscription.listeners.add(listener);
          subscriptions.add(sourceSubscription);
          return () => {
            subscription.listeners.delete(listener);
            if (subscription.listeners.size === 0) {
              subscriptions.delete(sourceSubscription);
            }
          };
        },
        destroy() {
          subscription.destroyed = true;
          subscription.listeners.clear();
          subscriptions.delete(sourceSubscription);
        },
      };
    },
  };
}
