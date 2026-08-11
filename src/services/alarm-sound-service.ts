import { getAlarmPyoNativeModule } from '../infrastructure/alarmpyo-native-module';

export type AlarmSoundStatus = {
  supported: boolean;
  selected: boolean;
  label: string;
  available: boolean;
};

type AlarmSoundNativeModule = {
  getAlarmSoundAsync?: () => Promise<unknown>;
  selectAlarmSoundAsync?: () => Promise<unknown>;
  previewAlarmSoundAsync?: () => Promise<unknown>;
  stopAlarmSoundPreviewAsync?: () => Promise<unknown>;
  resetAlarmSoundAsync?: () => Promise<unknown>;
};

const nativeModule = getAlarmPyoNativeModule() as
  | (ReturnType<typeof getAlarmPyoNativeModule> & AlarmSoundNativeModule)
  | null;

const UNSUPPORTED_STATUS: Readonly<AlarmSoundStatus> = {
  supported: false,
  selected: false,
  label: '시스템 기본 알람음',
  available: false,
};

function unsupportedStatus(): AlarmSoundStatus {
  return { ...UNSUPPORTED_STATUS };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeAlarmSoundStatus(value: unknown): AlarmSoundStatus {
  if (!isRecord(value)) return unsupportedStatus();
  const supported = value.supported === true;
  const label =
    typeof value.label === 'string' && value.label.trim().length > 0
      ? value.label.trim()
      : UNSUPPORTED_STATUS.label;
  return {
    supported,
    selected: supported && value.selected === true,
    label,
    available: supported && value.available === true,
  };
}

export function isAlarmSoundSelectionSupported(): boolean {
  return Boolean(
    nativeModule?.getAlarmSoundAsync &&
      nativeModule.selectAlarmSoundAsync &&
      nativeModule.previewAlarmSoundAsync &&
      nativeModule.stopAlarmSoundPreviewAsync &&
      nativeModule.resetAlarmSoundAsync,
  );
}

export async function getAlarmSound(): Promise<AlarmSoundStatus> {
  if (!nativeModule?.getAlarmSoundAsync) return unsupportedStatus();
  return normalizeAlarmSoundStatus(await nativeModule.getAlarmSoundAsync());
}

export async function selectAlarmSound(): Promise<AlarmSoundStatus> {
  if (!nativeModule?.selectAlarmSoundAsync) return unsupportedStatus();
  return normalizeAlarmSoundStatus(await nativeModule.selectAlarmSoundAsync());
}

export async function previewAlarmSound(): Promise<boolean> {
  if (!nativeModule?.previewAlarmSoundAsync) return false;
  return (await nativeModule.previewAlarmSoundAsync()) === true;
}

export async function stopAlarmSoundPreview(): Promise<boolean> {
  if (!nativeModule?.stopAlarmSoundPreviewAsync) return false;
  return (await nativeModule.stopAlarmSoundPreviewAsync()) === true;
}

export async function resetAlarmSound(): Promise<AlarmSoundStatus> {
  if (!nativeModule?.resetAlarmSoundAsync) return unsupportedStatus();
  return normalizeAlarmSoundStatus(await nativeModule.resetAlarmSoundAsync());
}
