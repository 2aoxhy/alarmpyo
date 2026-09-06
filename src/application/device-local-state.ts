/** Shared ownership of resettable device-only records, independent of any screen. */
export const PLAY_UPDATE_PROMPT_STORAGE_KEY = 'alarmpyo:update-prompt:v1';
export const QUICK_SETUP_DRAFT_KEY = 'alarmpyo:quick-setup-draft:v1';
export const SETUP_SESSION_DRAFT_KEY = 'alarmpyo:setup-session-draft:v2';

type RemovableDeviceRecords = { removeItem(key: string): Promise<void> };

export async function clearPlayUpdatePromptSnooze(storage: RemovableDeviceRecords): Promise<void> {
  await storage.removeItem(PLAY_UPDATE_PROMPT_STORAGE_KEY);
}

export async function clearQuickSetupDraft(storage: RemovableDeviceRecords): Promise<void> {
  // Keep established failure ordering: never clear the legacy fallback if V2 removal failed.
  await storage.removeItem(SETUP_SESSION_DRAFT_KEY);
  await storage.removeItem(QUICK_SETUP_DRAFT_KEY);
}
