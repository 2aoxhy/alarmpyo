/**
 * Runtime ports owned by the application layer.
 *
 * These contracts deliberately contain no Expo, React Native, AsyncStorage,
 * file-system, or native-module types. Infrastructure adapters translate the
 * existing wire contracts without changing them.
 */
export interface AppDataRepository {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface AlarmGateway<TPlan, TStatus, TMetadata = undefined> {
  readStatus(): Promise<TStatus>;
  requestPermissions(): Promise<TStatus>;
  synchronize(plans: readonly TPlan[], metadata?: TMetadata): Promise<TStatus>;
  cancelAll(): Promise<TStatus>;
}

export interface SleepReminderGateway<TPlan, TStatus> {
  synchronize(plans: readonly TPlan[]): Promise<TStatus>;
  cancelAll(): Promise<TStatus>;
  requestPermission(): Promise<TStatus>;
}

export interface WidgetGateway<TSnapshot> {
  isInstalled(): Promise<boolean>;
  synchronize(snapshot: TSnapshot): Promise<boolean>;
}

export interface BackupGateway<TData, TBackup> {
  readLatest(): Promise<TBackup | null>;
  write(data: TData, now?: Date): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export interface AppRuntimeContract {
  data: unknown;
  alarmPlan: unknown;
  alarmStatus: unknown;
  alarmMetadata: unknown;
  sleepPlan: unknown;
  sleepStatus: unknown;
  widgetSnapshot: unknown;
  backup: unknown;
}

export type AppRuntimeDependencies<TContract extends AppRuntimeContract> = {
  dataRepository: AppDataRepository;
  alarms: AlarmGateway<
    TContract['alarmPlan'],
    TContract['alarmStatus'],
    TContract['alarmMetadata']
  >;
  sleepReminders: SleepReminderGateway<
    TContract['sleepPlan'],
    TContract['sleepStatus']
  >;
  widget: WidgetGateway<TContract['widgetSnapshot']>;
  backup: BackupGateway<TContract['data'], TContract['backup']>;
  clock: Clock;
};
