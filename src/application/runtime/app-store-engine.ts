import type { AppStore, AppStoreActions } from '../app-store-contract';
import { createAppSelectorSource, type AppSelectorSource } from './app-selector-source';
import { createAppStoreEngineContext, type AppStoreOperations } from './store/engine-context';
import type { AppStoreEnginePorts, AppStoreLifecycle } from './store/engine-ports';
import { createAppStoreCommands } from './store/command-map';
import { registerBootCoordinator } from './store/boot-coordinator';
import { registerPersistenceCoordinator } from './store/persistence-coordinator';
import { registerRuntimeCoordinator } from './store/runtime-coordinator';
import { registerPatternCoordinator } from './store/pattern-coordinator';
import { registerRestoreCoordinator } from './store/restore-coordinator';
import { registerCommandsCoordinator } from './store/commands-coordinator';
import { AppStoreLifecycleCoordinator } from './store/lifecycle-coordinator';
import { AppStoreWidgetCoordinator } from './store/widget-coordinator';

export class AppStoreEngine {
  readonly commands: AppStoreActions;
  readonly selectors: AppSelectorSource<AppStore>;
  readonly runtime: AppStoreEnginePorts['runtime'];
  private readonly context;
  private readonly operations = {} as AppStoreOperations;
  private readonly lifecycleCoordinator;
  private readonly widgetCoordinator;
  private lifecycle: AppStoreLifecycle = { active: true, transitionId: 0 };
  private active = false;
  private generation = 0;
  private starting: Promise<boolean> | null = null;

  constructor(ports: AppStoreEnginePorts) {
    this.runtime = ports.runtime;
    this.context = createAppStoreEngineContext(ports);
    this.context.mountedRef.current = false;
    for (const register of [
      registerBootCoordinator,
      registerPersistenceCoordinator,
      registerRuntimeCoordinator,
      registerPatternCoordinator,
      registerRestoreCoordinator,
      registerCommandsCoordinator,
    ])
      register(this.context, this.operations);
    this.commands = Object.freeze(createAppStoreCommands(this.operations));
    this.selectors = createAppSelectorSource(this.snapshot());
    this.lifecycleCoordinator = new AppStoreLifecycleCoordinator(this.context, this.operations);
    this.widgetCoordinator = new AppStoreWidgetCoordinator(this.context);
    this.context.state.subscribe(() => {
      this.context.dataRef.current = this.context.state.getSnapshot().data;
      if (!this.active) return;
      this.selectors.setSnapshot(this.snapshot());
      this.lifecycleCoordinator.reconcile();
      this.widgetCoordinator.update(this.lifecycle.active, this.lifecycle.transitionId);
    });
  }

  private snapshot(): AppStore {
    return Object.freeze({
      ...this.context.state.getSnapshot(),
      ...this.commands,
      getShiftForDate: this.operations.getShiftForDate,
      getNoteForDate: this.operations.getNoteForDate,
    });
  }

  getSnapshot = (): AppStore => this.selectors.getSnapshot();

  subscribe = (listener: () => void): (() => void) => {
    const subscription = this.selectors.createSubscription((value) => value);
    const unsubscribe = subscription.subscribe(listener);
    return () => {
      unsubscribe();
      subscription.destroy();
    };
  };

  start = (): Promise<boolean> => {
    if (this.active) return this.starting ?? Promise.resolve(this.context.readyRef.current);
    this.active = true;
    const generation = ++this.generation;
    this.context.sessionRevisionRef.current = generation;
    this.context.mountedRef.current = true;
    this.context.readyRef.current = false;
    this.context.setReady(false);
    this.lifecycleCoordinator.start();
    const operation = this.context.mutationCoordinator.run(async () => {
      if (!this.active || generation !== this.generation) return false;
      return this.operations.loadData();
    });
    const tracked = operation.finally(() => {
      if (this.starting === tracked) this.starting = null;
    });
    this.starting = tracked;
    return tracked;
  };

  stop = (): void => {
    if (!this.active) return;
    this.active = false;
    this.generation += 1;
    this.context.sessionRevisionRef.current = this.generation;
    this.context.mountedRef.current = false;
    this.context.readyRef.current = false;
    this.context.loadAttemptRef.current += 1;
    this.context.sleepReminderSyncAttemptRef.current += 1;
    this.lifecycleCoordinator.stop();
    this.widgetCoordinator.stop();
  };

  updateLifecycle = (next: AppStoreLifecycle): void => {
    this.lifecycle = next;
    this.lifecycleCoordinator.update(next);
    if (this.active) this.widgetCoordinator.update(next.active, next.transitionId);
  };
}
