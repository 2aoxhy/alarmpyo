import { resolveShiftFromAppData } from '../../app-data-policy';
import { buildAlarmPyoWidgetSnapshot } from '../../../services/widget-planner';
import { getScheduleProjectionTimeZoneSignature } from '../../../services/schedule-projection-cache';
import {
  createWidgetSnapshotPreflightCoordinator,
  createWidgetSyncCoordinator,
  syncWidgetWithRetry,
} from '../../../services/widget-sync-policy';
import { getWidgetScheduleSignature } from '../../../services/widget-schedule-signature';
import { toDateKey } from '../../../utils/date';
import type { AppStoreEngineContext } from './engine-context';

/** Owns the single widget writer for the app; unrelated state changes never build its projection. */
export class AppStoreWidgetCoordinator {
  private readonly preflight = createWidgetSnapshotPreflightCoordinator();
  private readonly sync = createWidgetSyncCoordinator();
  private revision = 0;
  private key: string | null = null;

  constructor(private readonly context: AppStoreEngineContext) {}

  stop(): void {
    this.revision += 1;
    this.key = null;
  }

  update(active: boolean, transitionId: number): void {
    const { runtime, platform, state } = this.context;
    const { data, ready } = state.getSnapshot();
    if (!ready || !active || !platform.widgetSupported) {
      this.stop();
      return;
    }
    const signature = getWidgetScheduleSignature(data);
    const key = `${transitionId}:${signature}`;
    if (key === this.key) return;
    this.key = key;
    const revision = ++this.revision;
    const cancelled = () => revision !== this.revision;
    void (async () => {
      const now = runtime.now();
      const generatedDateKey = toDateKey(now);
      const installed = await runtime.isWidgetInstalled();
      if (cancelled()) return;
      const input = {
        installed,
        supportsGeneratedPreview: platform.supportsGeneratedWidgetPreview,
        scheduleSignature: signature,
        generatedDateKey,
        timeZoneSignature: getScheduleProjectionTimeZoneSignature(now),
        nowMs: now.getTime(),
      };
      if (!this.preflight.shouldBuild(input)) return;
      let completed = false;
      try {
        const snapshot = buildAlarmPyoWidgetSnapshot(
          data,
          (dateKey) => resolveShiftFromAppData(data, dateKey),
          { now },
        );
        const result = await syncWidgetWithRetry(
          () =>
            this.sync.sync(snapshot, generatedDateKey, (prepared) =>
              runtime.synchronizeWidget(prepared),
            ),
          cancelled,
        );
        completed = result === 'synced' || result === 'skipped';
      } finally {
        this.preflight.complete(input, completed);
      }
    })().catch(() => {
      if (!cancelled()) this.sync.reset();
    });
  }
}
