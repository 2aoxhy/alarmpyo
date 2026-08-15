import { describe, expect, it, vi } from 'vitest';

import type { AlarmPyoWidgetSnapshot } from '../widget-planner';
import {
  createInstalledWidgetSnapshot,
  createWidgetSnapshotPreflightCoordinator,
  createWidgetSyncCoordinator,
  GENERATED_WIDGET_PREVIEW_REFRESH_MS,
  syncWidgetWithRetry,
} from '../widget-sync-policy';

function createSnapshot(
  patch: Partial<AlarmPyoWidgetSnapshot> = {},
): AlarmPyoWidgetSnapshot {
  return {
    version: 2,
    generatedAt: new Date(2026, 6, 13, 10).getTime(),
    setupCompleted: true,
    displayOptions: {
      todayShift: true,
      nextShift: true,
      nextAlarm: true,
    },
    alarms: [],
    entries: [
      {
        dateKey: '2026-07-13',
        shiftTypeId: 'day',
        shiftName: '주간',
        startMinutes: 7 * 60,
        endMinutes: 18 * 60,
        endsNextDay: false,
        isOff: false,
        isOverride: false,
        exceptionName: null,
      },
    ],
    ...patch,
  };
}

const widgetPayloadChanges: {
  initialPatch?: Partial<AlarmPyoWidgetSnapshot>;
  name: string;
  patch: Partial<AlarmPyoWidgetSnapshot>;
}[] = [
  {
    name: '다음 알람',
    initialPatch: {
      alarms: [
        {
          alarmAt: new Date(2026, 6, 13, 5, 10).getTime(),
          shiftTypeId: 'day',
          shiftName: '주간',
        },
      ],
    },
    patch: {
      alarms: [
        {
          alarmAt: new Date(2026, 6, 14, 5, 10).getTime(),
          shiftTypeId: 'day',
          shiftName: '주간',
        },
      ],
    },
  },
  {
    name: '알람 활성 여부',
    patch: {
      alarms: [
        {
          alarmAt: new Date(2026, 6, 13, 5, 10).getTime(),
          shiftTypeId: 'day',
          shiftName: '주간',
        },
      ],
    },
  },
  {
    name: '표시 옵션',
    patch: {
      displayOptions: {
        todayShift: true,
        nextShift: false,
        nextAlarm: true,
      },
    },
  },
  {
    name: '근무 항목',
    patch: {
      entries: [
        {
          dateKey: '2026-07-13',
          shiftTypeId: 'night',
          shiftName: '야간',
          startMinutes: 18 * 60,
          endMinutes: 7 * 60,
          endsNextDay: true,
          isOff: false,
          isOverride: true,
          exceptionName: null,
        },
      ],
    },
  },
];

describe('ALARMPYO 위젯 동기화 정책', () => {
  it('변경 없는 Android 15+ 복귀는 30분 동안 전체 스냅샷 생성을 건너뜁니다', () => {
    const coordinator = createWidgetSnapshotPreflightCoordinator();
    const input = {
      installed: false,
      supportsGeneratedPreview: true,
      scheduleSignature: 'schedule-a',
      generatedDateKey: '2026-08-15',
      timeZoneSignature: 'Asia/Seoul|540',
      nowMs: 1_000,
    };

    expect(coordinator.shouldBuild(input)).toBe(true);
    expect(coordinator.shouldBuild(input)).toBe(false);
    coordinator.complete(input, true);
    expect(coordinator.shouldBuild({ ...input, nowMs: 10_000 })).toBe(false);
    expect(coordinator.shouldBuild({
      ...input,
      nowMs: input.nowMs + GENERATED_WIDGET_PREVIEW_REFRESH_MS,
    })).toBe(true);
  });

  it('일정이나 날짜가 바뀌면 생성형 미리보기를 즉시 다시 만듭니다', () => {
    const coordinator = createWidgetSnapshotPreflightCoordinator();
    const input = {
      installed: false,
      supportsGeneratedPreview: true,
      scheduleSignature: 'schedule-a',
      generatedDateKey: '2026-08-15',
      timeZoneSignature: 'Asia/Seoul|540',
      nowMs: 1_000,
    };
    expect(coordinator.shouldBuild(input)).toBe(true);
    coordinator.complete(input, true);
    expect(coordinator.shouldBuild({
      ...input,
      scheduleSignature: 'schedule-b',
      nowMs: 2_000,
    })).toBe(true);
    coordinator.complete({
      ...input,
      scheduleSignature: 'schedule-b',
      nowMs: 2_000,
    }, true);
    expect(coordinator.shouldBuild({
      ...input,
      scheduleSignature: 'schedule-b',
      generatedDateKey: '2026-08-16',
      nowMs: 3_000,
    })).toBe(true);
  });

  it('설치된 위젯도 같은 값은 생략하고 변경은 즉시 반영합니다', () => {
    const coordinator = createWidgetSnapshotPreflightCoordinator();
    const input = {
      installed: true,
      supportsGeneratedPreview: true,
      scheduleSignature: 'schedule-a',
      generatedDateKey: '2026-08-15',
      timeZoneSignature: 'Asia/Seoul|540',
      nowMs: 1_000,
    };
    expect(coordinator.shouldBuild(input)).toBe(true);
    coordinator.complete(input, true);
    expect(coordinator.shouldBuild({ ...input, nowMs: 99_000_000 })).toBe(false);
    expect(coordinator.shouldBuild({
      ...input,
      timeZoneSignature: 'America/Phoenix|420',
      nowMs: 100_000_000,
    })).toBe(true);
    coordinator.complete({
      ...input,
      timeZoneSignature: 'America/Phoenix|420',
      nowMs: 100_000_000,
    }, true);
    expect(coordinator.shouldBuild({
      ...input,
      scheduleSignature: 'schedule-b',
      nowMs: 2_000,
    })).toBe(true);
  });

  it('동기화 실패는 동일한 값의 다음 시도를 허용합니다', () => {
    const coordinator = createWidgetSnapshotPreflightCoordinator();
    const input = {
      installed: true,
      supportsGeneratedPreview: false,
      scheduleSignature: 'schedule-a',
      generatedDateKey: '2026-08-15',
      timeZoneSignature: 'Asia/Seoul|540',
      nowMs: 1_000,
    };
    expect(coordinator.shouldBuild(input)).toBe(true);
    coordinator.complete(input, false);
    expect(coordinator.shouldBuild({ ...input, nowMs: 2_000 })).toBe(true);
  });

  it('위젯이 없으면 스냅샷 계산을 건너뛰어요', async () => {
    const createSnapshot = vi.fn(() => ({ entries: Array.from({ length: 366 }) }));

    await expect(
      createInstalledWidgetSnapshot(async () => false, createSnapshot),
    ).resolves.toBeNull();
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it('Android 15+ 생성형 미리보기는 설치된 위젯이 없어도 스냅샷을 만들어요', async () => {
    const snapshot = { entries: ['오늘', '다음 근무'] };
    const createSnapshot = vi.fn(() => snapshot);

    await expect(
      createInstalledWidgetSnapshot(
        async () => false,
        createSnapshot,
        () => false,
        true,
      ),
    ).resolves.toBe(snapshot);
    expect(createSnapshot).toHaveBeenCalledOnce();
  });

  it('위젯을 설치하면 같은 앱 실행 중에도 스냅샷을 만들어요', async () => {
    const snapshot = { entries: ['오늘', '다음 근무'] };
    const createSnapshot = vi.fn(() => snapshot);

    await expect(
      createInstalledWidgetSnapshot(async () => true, createSnapshot),
    ).resolves.toBe(snapshot);
    expect(createSnapshot).toHaveBeenCalledOnce();
  });

  it('설치 확인 중 화면 상태가 바뀌면 오래된 계산을 건너뛰어요', async () => {
    const createSnapshot = vi.fn(() => ({ entries: [] }));

    await expect(
      createInstalledWidgetSnapshot(async () => true, createSnapshot, () => true),
    ).resolves.toBeNull();
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it('생성 시각만 다른 동일 스냅샷은 네이티브에 한 번만 전달해요', async () => {
    const coordinator = createWidgetSyncCoordinator();
    const synchronize = vi.fn(async () => true);
    const first = createSnapshot();
    const regenerated = createSnapshot({ generatedAt: first.generatedAt + 60_000 });

    await expect(
      coordinator.sync(first, '2026-07-13', synchronize),
    ).resolves.toBe('synced');
    await expect(
      coordinator.sync(regenerated, '2026-07-13', synchronize),
    ).resolves.toBe('skipped');
    expect(synchronize).toHaveBeenCalledOnce();
  });

  it.each(widgetPayloadChanges)(
    '$name 변경은 변경된 스냅샷마다 정확히 한 번 동기화해요',
    async ({ initialPatch, patch }) => {
      const coordinator = createWidgetSyncCoordinator();
      const synchronize = vi.fn(async () => true);
      const initial = createSnapshot(initialPatch);
      const changed = createSnapshot(patch);

      await coordinator.sync(initial, '2026-07-13', synchronize);
      await coordinator.sync(changed, '2026-07-13', synchronize);
      await coordinator.sync(changed, '2026-07-13', synchronize);

      expect(synchronize).toHaveBeenCalledTimes(2);
    },
  );

  it('같은 날짜에 동시에 시작한 동일 동기화도 한 번만 호출해요', async () => {
    const coordinator = createWidgetSyncCoordinator();
    let complete: ((value: boolean) => void) | undefined;
    const synchronize = vi.fn(
      () => new Promise<boolean>((resolve) => {
        complete = resolve;
      }),
    );
    const snapshot = createSnapshot();

    const first = coordinator.sync(snapshot, '2026-07-13', synchronize);
    const duplicate = coordinator.sync(snapshot, '2026-07-13', synchronize);
    await expect(duplicate).resolves.toBe('skipped');
    expect(synchronize).toHaveBeenCalledOnce();

    complete?.(true);
    await expect(first).resolves.toBe('synced');
  });

  it('네이티브 동기화 실패 뒤에는 동일 스냅샷을 다시 시도해요', async () => {
    const coordinator = createWidgetSyncCoordinator();
    const synchronize = vi
      .fn<(snapshot: AlarmPyoWidgetSnapshot) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const snapshot = createSnapshot();

    await expect(
      coordinator.sync(snapshot, '2026-07-13', synchronize),
    ).resolves.toBe('failed');
    await expect(
      coordinator.sync(snapshot, '2026-07-13', synchronize),
    ).resolves.toBe('synced');
    expect(synchronize).toHaveBeenCalledTimes(2);
  });

  it('일시적인 동기화 실패는 활성 상태에서 최대 세 번만 시도해요', async () => {
    const synchronize = vi
      .fn<() => Promise<'failed' | 'synced'>>()
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('synced');
    const wait = vi.fn(async () => undefined);

    await expect(syncWidgetWithRetry(synchronize, () => false, wait)).resolves.toBe(
      'synced',
    );
    expect(synchronize).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('앱이 비활성화되면 대기 중인 위젯 재시도를 중단해요', async () => {
    let cancelled = false;
    const synchronize = vi.fn(async () => 'failed' as const);
    const wait = vi.fn(async () => {
      cancelled = true;
    });

    await expect(syncWidgetWithRetry(synchronize, () => cancelled, wait)).resolves.toBe(
      'cancelled',
    );
    expect(synchronize).toHaveBeenCalledOnce();
  });
});
