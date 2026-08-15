import type { AlarmPyoWidgetSnapshot } from './widget-planner';

export const GENERATED_WIDGET_PREVIEW_REFRESH_MS = 30 * 60 * 1_000;

export type WidgetSnapshotPreflightInput = {
  installed: boolean;
  supportsGeneratedPreview: boolean;
  scheduleSignature: string;
  generatedDateKey: string;
  timeZoneSignature: string;
  nowMs: number;
};

export type WidgetSnapshotPreflightCoordinator = {
  shouldBuild: (input: WidgetSnapshotPreflightInput) => boolean;
  complete: (input: WidgetSnapshotPreflightInput, succeeded: boolean) => void;
  reset: () => void;
};

function createWidgetPreflightKey(
  input: WidgetSnapshotPreflightInput,
): string {
  return JSON.stringify({
    installed: input.installed,
    supportsGeneratedPreview: input.supportsGeneratedPreview,
    scheduleSignature: input.scheduleSignature,
    generatedDateKey: input.generatedDateKey,
    timeZoneSignature: input.timeZoneSignature,
  });
}

/**
 * 비용이 큰 366일 스냅샷을 만들기 전에 설치 상태와 일정 서명만 비교합니다.
 * 설치된 위젯은 변경 즉시 갱신하고, 미설치 Android 15+ 미리보기는 같은
 * 실행 중 최대 30분에 한 번만 다시 생성합니다.
 */
export function createWidgetSnapshotPreflightCoordinator(): WidgetSnapshotPreflightCoordinator {
  let completedKey: string | null = null;
  let completedAt = 0;
  let pendingKey: string | null = null;

  return {
    shouldBuild(input) {
      if (!input.installed && !input.supportsGeneratedPreview) return false;
      const key = createWidgetPreflightKey(input);
      if (pendingKey === key) return false;
      const sameCompletedValue = completedKey === key;
      const generatedPreviewExpired =
        !input.installed &&
        input.supportsGeneratedPreview &&
        input.nowMs - completedAt >= GENERATED_WIDGET_PREVIEW_REFRESH_MS;
      if (sameCompletedValue && !generatedPreviewExpired) return false;
      pendingKey = key;
      return true;
    },
    complete(input, succeeded) {
      const key = createWidgetPreflightKey(input);
      if (pendingKey === key) pendingKey = null;
      if (!succeeded) return;
      completedKey = key;
      completedAt = input.nowMs;
    },
    reset() {
      completedKey = null;
      completedAt = 0;
      pendingKey = null;
    },
  };
}

/**
 * 위젯 설치 여부를 먼저 확인한 뒤에만 비용이 큰 스냅샷 계산을 실행해요.
 * Android 15+ 생성형 선택기 미리보기에는 설치 전에도 명시적으로 계산할 수 있어요.
 * 설치 확인을 기다리는 동안 화면 상태가 바뀌면 이전 계산도 건너뛰어요.
 */
export async function createInstalledWidgetSnapshot<T>(
  checkInstalled: () => Promise<boolean>,
  createSnapshot: () => T,
  shouldCancel: () => boolean = () => false,
  includeWhenNotInstalled = false,
): Promise<T | null> {
  const installed = await checkInstalled();
  if ((!installed && !includeWhenNotInstalled) || shouldCancel()) return null;
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
