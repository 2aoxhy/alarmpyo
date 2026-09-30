export type QuickSetupAlarmPreparationResult =
  | { status: 'ready'; enabledNow: boolean }
  | { status: 'enable-failed' }
  | { status: 'error' };

/** 알람 켜기 결과를 삼켜 버리지 않고 화면 이동 여부로 변환합니다. */
export async function prepareQuickSetupAlarmReadiness(
  notificationsEnabled: boolean,
  enableAlarms: () => Promise<boolean>,
): Promise<QuickSetupAlarmPreparationResult> {
  if (notificationsEnabled) return { status: 'ready', enabledNow: false };
  try {
    const enabled = await enableAlarms();
    return enabled
      ? { status: 'ready', enabledNow: true }
      : { status: 'enable-failed' };
  } catch {
    return { status: 'error' };
  }
}
