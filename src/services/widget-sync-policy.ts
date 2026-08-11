import type { AlarmPyoWidgetSnapshot } from './widget-planner';

/**
 * 위젯 설치 여부를 먼저 확인한 뒤에만 비용이 큰 스냅샷 계산을 실행해요.
 * 설치 확인을 기다리는 동안 화면 상태가 바뀌면 이전 계산도 건너뛰어요.
 */
export async function createInstalledWidgetSnapshot<T>(
  checkInstalled: () => Promise<boolean>,
  createSnapshot: () => T,
  shouldCancel: () => boolean = () => false,
): Promise<T | null> {
  const installed = await checkInstalled();
  if (!installed || shouldCancel()) return null;
  return createSnapshot();
}

export type WidgetSyncResult = 'failed' | 'skipped' | 'synced';
export type WidgetSyncRetryResult = WidgetSyncResult | 'cancelled';

export const WIDGET_SYNC_RETRY_DELAYS_MS = [250, 750] as const;

const waitFor = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

/**
 * 앱이 활성 상태인 동안만 짧게 두 번 더 시도해 일시적인 네이티브 브리지 실패를 복구해요.
 * 장기 폴링이나 백그라운드 반복은 만들지 않아요.
 */
export async function syncWidgetWithRetry(
  synchronize: () => Promise<WidgetSyncResult>,
  shouldCancel: () => boolean = () => false,
  wait: (delayMs: number) => Promise<void> = waitFor,
): Promise<WidgetSyncRetryResult> {
  for (let attempt = 0; attempt <= WIDGET_SYNC_RETRY_DELAYS_MS.length; attempt += 1) {
    if (shouldCancel()) return 'cancelled';
    try {
      const result = await synchronize();
      if (result !== 'failed') return result;
    } catch {
      // 다음 제한된 시도에서 같은 스냅샷을 다시 전달해요.
    }

    const delayMs = WIDGET_SYNC_RETRY_DELAYS_MS[attempt];
    if (delayMs === undefined) return 'failed';
    await wait(delayMs);
  }
  return 'failed';
}

export type WidgetSyncCoordinator = {
  reset: () => void;
  sync: (
    snapshot: AlarmPyoWidgetSnapshot,
    generatedDateKey: string,
    synchronize: (snapshot: AlarmPyoWidgetSnapshot) => Promise<boolean>,
  ) => Promise<WidgetSyncResult>;
};

/**
 * 생성 시각은 앱을 다시 활성화할 때마다 달라지므로 중복 판단에서 제외하고,
 * 날짜와 네이티브에 전달되는 나머지 스냅샷 전체를 서명에 포함해요.
 * 스냅샷 버전에 필드가 추가돼도 별도 목록을 갱신하지 않아도 자동으로 반영돼요.
 */
export function createWidgetSyncSignature(
  snapshot: AlarmPyoWidgetSnapshot,
  generatedDateKey: string,
): string {
  const { generatedAt: _generatedAt, ...nativePayload } = snapshot;
  return JSON.stringify({ generatedDateKey, ...nativePayload });
}

/**
 * 같은 의미의 스냅샷은 진행 중인 호출까지 포함해 한 번만 동기화해요.
 * 네이티브 동기화가 실패하면 같은 자료를 다음 기회에 다시 보낼 수 있도록 해제해요.
 */
export function createWidgetSyncCoordinator(): WidgetSyncCoordinator {
  let lastSignature: string | null = null;

  return {
    reset() {
      lastSignature = null;
    },
    async sync(snapshot, generatedDateKey, synchronize) {
      const signature = createWidgetSyncSignature(snapshot, generatedDateKey);
      if (lastSignature === signature) return 'skipped';

      // 비동기 네이티브 호출 전에 기록해 동시에 시작된 동일 호출도 막아요.
      lastSignature = signature;
      try {
        const synced = await synchronize(snapshot);
        if (!synced && lastSignature === signature) lastSignature = null;
        return synced ? 'synced' : 'failed';
      } catch (error) {
        if (lastSignature === signature) lastSignature = null;
        throw error;
      }
    },
  };
}
