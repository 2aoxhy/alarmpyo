import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';

import { useAppLifecycle } from '@/hooks/use-app-active';
import { resolveShiftFromAppData } from '@/services/app-data-service';
import { buildAlarmPyoWidgetSnapshot } from '@/services/widget-planner';
import { getScheduleProjectionTimeZoneSignature } from '@/services/schedule-projection-cache';
import {
  createWidgetSnapshotPreflightCoordinator,
  createWidgetSyncCoordinator,
  syncWidgetWithRetry,
  type WidgetSnapshotPreflightCoordinator,
  type WidgetSyncCoordinator,
} from '@/services/widget-sync-policy';
import { getWidgetScheduleSignature } from '@/services/widget-schedule-signature';
import {
  useAppRuntimeController,
  useAppSelector,
  type AppStore,
} from '@/store/app-store';
import { toDateKey } from '@/utils/date';

type WidgetStoreState = Pick<AppStore, 'data' | 'ready'>;

function selectWidgetStoreState(store: AppStore): WidgetStoreState {
  return { data: store.data, ready: store.ready };
}

function isSameWidgetStoreState(
  previous: WidgetStoreState,
  next: WidgetStoreState,
): boolean {
  return previous.ready === next.ready &&
    getWidgetScheduleSignature(previous.data) ===
      getWidgetScheduleSignature(next.data);
}

/**
 * 앱 데이터가 실제로 바뀌거나 앱을 다시 사용하는 날이 바뀔 때만
 * 네이티브 위젯 스냅샷을 갱신합니다.
 * 네이티브에서는 날짜·시간대 이벤트와 한 번짜리 시간 경계 알람으로 표시를 갱신하므로
 * JS 타이머나 백그라운드 폴링이 필요하지 않습니다.
 */
export function AlarmPyoWidgetSyncBridge() {
  const { data, ready } = useAppSelector(
    selectWidgetStoreState,
    isSameWidgetStoreState,
  );
  const runtime = useAppRuntimeController();
  const appLifecycle = useAppLifecycle();
  const latestDataRef = useRef(data);
  const widgetSyncCoordinatorRef = useRef<WidgetSyncCoordinator | null>(null);
  const snapshotPreflightCoordinatorRef =
    useRef<WidgetSnapshotPreflightCoordinator | null>(null);
  if (widgetSyncCoordinatorRef.current === null) {
    widgetSyncCoordinatorRef.current = createWidgetSyncCoordinator();
  }
  if (snapshotPreflightCoordinatorRef.current === null) {
    snapshotPreflightCoordinatorRef.current =
      createWidgetSnapshotPreflightCoordinator();
  }
  const widgetScheduleSignature = useMemo(
    () => getWidgetScheduleSignature(data),
    [data],
  );

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!ready || !appLifecycle.active || Platform.OS !== 'android') return;
    let cancelled = false;
    const snapshotData = latestDataRef.current;

    void (async () => {
      // 설치 여부를 먼저 확인해 위젯을 쓰지 않는 휴대폰에서는 장기 근무표 계산과
      // JSON 직렬화를 하지 않아요. 앱으로 돌아오면 다시 확인하므로 새로 설치한
      // 위젯은 기존 근무 데이터가 바뀌지 않았어도 즉시 스냅샷을 받아요.
      const now = runtime.now();
      const generatedDateKey = toDateKey(now);
      const supportsGeneratedPreview =
        typeof Platform.Version === 'number' && Platform.Version >= 35;
      const installed = await runtime.isWidgetInstalled();
      if (cancelled) return;
      const preflight = {
        installed,
        supportsGeneratedPreview,
        scheduleSignature: widgetScheduleSignature,
        generatedDateKey,
        timeZoneSignature: getScheduleProjectionTimeZoneSignature(now),
        nowMs: now.getTime(),
      };
      if (!snapshotPreflightCoordinatorRef.current?.shouldBuild(preflight)) return;
      let completed = false;
      try {
        const snapshot = buildAlarmPyoWidgetSnapshot(
          snapshotData,
          (dateKey) => resolveShiftFromAppData(snapshotData, dateKey),
          { now },
        );
        // 앱을 다시 사용할 때 하루에 한 번 장기 계산 범위를 앞으로 옮기고,
        // 표시 옵션·다음 알람·근무 항목 중 하나라도 바뀌면 즉시 갱신합니다.
        const result = await syncWidgetWithRetry(
          async () =>
            widgetSyncCoordinatorRef.current?.sync(
              snapshot,
              generatedDateKey,
              (preparedSnapshot) => runtime.synchronizeWidget(preparedSnapshot),
            ) ?? 'failed',
          () => cancelled,
        );
        completed = result === 'synced' || result === 'skipped';
      } finally {
        snapshotPreflightCoordinatorRef.current?.complete(preflight, completed);
      }
    })().catch(() => {
      // 위젯은 부가 기능이므로 저장과 알람의 성공 상태에는 영향을 주지 않습니다.
      if (!cancelled) widgetSyncCoordinatorRef.current?.reset();
    });

    return () => {
      cancelled = true;
    };
  }, [
    appLifecycle.active,
    appLifecycle.transitionId,
    ready,
    runtime,
    widgetScheduleSignature,
  ]);

  return null;
}
