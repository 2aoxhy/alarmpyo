export type AlarmSyncRunResult<TStatus> = {
  success: boolean;
  status: TStatus | null;
  synchronized: boolean;
};

/**
 * 알람을 끈 스냅샷은 빈 일반 계획만 동기화하지 않고 네이티브 알람 전체를 정리해요.
 * 이렇게 해야 현재 울리는 서비스와 시험·5분 재알람도 함께 멈춰요.
 */
export async function applyNativeAlarmSnapshot<TStatus, TPlan>({
  notificationsEnabled,
  plan,
  synchronize,
  cancelAll,
}: {
  notificationsEnabled: boolean;
  plan: readonly TPlan[];
  synchronize: (plan: readonly TPlan[]) => Promise<TStatus>;
  cancelAll: () => Promise<TStatus>;
}): Promise<TStatus> {
  return notificationsEnabled ? synchronize(plan) : cancelAll();
}

/**
 * 네이티브 상태를 먼저 확인한 뒤에만 긴 알람 계획을 만들고 동기화해요.
 * 상태 조회 오류는 잡지 않아 호출자가 실패를 기록하고 다음 요청에서 다시 시도할 수 있게 해요.
 */
export async function runAlarmSyncCheck<TStatus, TPlan>({
  skipStatusCheck = false,
  readStatus,
  createPlan,
  createSyncPlan,
  shouldSynchronize,
  synchronize,
}: {
  skipStatusCheck?: boolean;
  readStatus: () => Promise<TStatus>;
  createPlan: () => readonly TPlan[];
  createSyncPlan?: () => readonly TPlan[];
  shouldSynchronize: (status: TStatus, plan: readonly TPlan[]) => boolean;
  synchronize: (plan: readonly TPlan[]) => Promise<boolean>;
}): Promise<AlarmSyncRunResult<TStatus>> {
  if (skipStatusCheck) {
    return { success: true, status: null, synchronized: false };
  }

  const status = await readStatus();
  const plan = createPlan();
  if (!shouldSynchronize(status, plan)) {
    return { success: true, status, synchronized: false };
  }

  return {
    success: await synchronize(createSyncPlan?.() ?? plan),
    status,
    synchronized: true,
  };
}
