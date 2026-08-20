import type {
  AppRuntimeContract,
  AppRuntimeDependencies,
} from './app-runtime-ports';

/**
 * Coordinates platform runtime capabilities behind application-owned ports.
 * Scheduling policy and persistence policy stay in their existing pure
 * services during the V14 incremental migration; this controller owns only
 * the platform boundary.
 */
export class AppRuntimeController<TContract extends AppRuntimeContract> {
  readonly dataRepository: AppRuntimeDependencies<TContract>['dataRepository'];

  constructor(private readonly dependencies: AppRuntimeDependencies<TContract>) {
    this.dataRepository = dependencies.dataRepository;
  }

  now(): Date {
    return this.dependencies.clock.now();
  }

  readAlarmStatus(): Promise<TContract['alarmStatus']> {
    return this.dependencies.alarms.readStatus();
  }

  requestAlarmPermissions(): Promise<TContract['alarmStatus']> {
    return this.dependencies.alarms.requestPermissions();
  }

  synchronizeAlarms(
    plans: readonly TContract['alarmPlan'][],
    metadata?: TContract['alarmMetadata'],
  ): Promise<TContract['alarmStatus']> {
    return this.dependencies.alarms.synchronize(plans, metadata);
  }

  cancelAllAlarms(): Promise<TContract['alarmStatus']> {
    return this.dependencies.alarms.cancelAll();
  }

  synchronizeSleepReminders(
    plans: readonly TContract['sleepPlan'][],
  ): Promise<TContract['sleepStatus']> {
    return this.dependencies.sleepReminders.synchronize(plans);
  }

  cancelAllSleepReminders(): Promise<TContract['sleepStatus']> {
    return this.dependencies.sleepReminders.cancelAll();
  }

  requestSleepReminderPermission(): Promise<TContract['sleepStatus']> {
    return this.dependencies.sleepReminders.requestPermission();
  }

  isWidgetInstalled(): Promise<boolean> {
    return this.dependencies.widget.isInstalled();
  }

  synchronizeWidget(snapshot: TContract['widgetSnapshot']): Promise<boolean> {
    return this.dependencies.widget.synchronize(snapshot);
  }

  readLatestBackup(): Promise<TContract['backup'] | null> {
    return this.dependencies.backup.readLatest();
  }

  writeBackup(data: TContract['data'], now = this.now()): Promise<boolean> {
    return this.dependencies.backup.write(data, now);
  }
}
