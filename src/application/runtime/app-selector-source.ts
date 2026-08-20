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
  listener: (() => void) | null;
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
  const subscriptions = new Set<InternalSubscription<TState, unknown>>();

  return {
    getSnapshot: () => state,
    setSnapshot(nextState) {
      if (Object.is(state, nextState)) return;
      state = nextState;
      for (const subscription of subscriptions) {
        const nextSelected = subscription.selector(nextState);
        if (subscription.equality(subscription.selected, nextSelected)) continue;
        subscription.selected = nextSelected;
        subscription.listener?.();
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
        listener: null,
      };
      subscriptions.add(
        subscription as InternalSubscription<TState, unknown>,
      );
      return {
        getSnapshot: () => subscription.selected,
        subscribe(listener) {
          subscription.listener = listener;
          return () => {
            if (subscription.listener === listener) subscription.listener = null;
          };
        },
        destroy() {
          subscriptions.delete(
            subscription as InternalSubscription<TState, unknown>,
          );
          subscription.listener = null;
        },
      };
    },
  };
}
