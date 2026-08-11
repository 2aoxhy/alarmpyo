import { describe, expect, it, vi } from 'vitest';

import { applyNativeAlarmSnapshot, runAlarmSyncCheck } from '../alarm-sync-runner';

describe('네이티브 알람 스냅샷 적용', () => {
  it('알람을 끄면 빈 계획 동기화 대신 전체 취소를 호출해요', async () => {
    const synchronize = vi.fn(async () => 'synced');
    const cancelAll = vi.fn(async () => 'cancelled');

    await expect(applyNativeAlarmSnapshot({
      notificationsEnabled: false,
      plan: [],
      synchronize,
      cancelAll,
    })).resolves.toBe('cancelled');

    expect(cancelAll).toHaveBeenCalledOnce();
    expect(synchronize).not.toHaveBeenCalled();
  });

  it('알람을 켜면 계산한 계획만 동기화해요', async () => {
    const plan = [{ id: 'day-alarm' }];
    const synchronize = vi.fn(async () => 'synced');
    const cancelAll = vi.fn(async () => 'cancelled');

    await expect(applyNativeAlarmSnapshot({
      notificationsEnabled: true,
      plan,
      synchronize,
      cancelAll,
    })).resolves.toBe('synced');

    expect(synchronize).toHaveBeenCalledWith(plan);
    expect(cancelAll).not.toHaveBeenCalled();
  });
});

describe('앱 저장소 알람 초기 동기화', () => {
  it('네이티브 상태를 먼저 읽고 이미 정상이면 90일 계획을 전달하지 않아요', async () => {
    const order: string[] = [];
    const synchronize = vi.fn(async () => true);

    const result = await runAlarmSyncCheck({
      readStatus: async () => {
        order.push('상태');
        return { scheduledCount: 3 };
      },
      createPlan: () => {
        order.push('계획');
        return Array.from({ length: 60 }, (_, id) => ({ id }));
      },
      shouldSynchronize: () => {
        order.push('판단');
        return false;
      },
      synchronize,
    });

    expect(order).toEqual(['상태', '계획', '판단']);
    expect(synchronize).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, synchronized: false });
  });

  it('예약 불일치를 확인한 경우에만 준비한 계획을 한 번 전달해요', async () => {
    const plan = [{ id: '다음 주간' }, { id: '다음 야간' }];
    const synchronize = vi.fn(async () => true);

    await expect(runAlarmSyncCheck({
      readStatus: async () => ({ scheduledCount: 1 }),
      createPlan: () => plan,
      shouldSynchronize: () => true,
      synchronize,
    })).resolves.toMatchObject({ success: true, synchronized: true });
    expect(synchronize).toHaveBeenCalledOnce();
    expect(synchronize).toHaveBeenCalledWith(plan);
  });

  it('가벼운 점검 계획이 맞지 않을 때만 전체 동기화 계획을 만들어요', async () => {
    const checkPlan = [{ id: '가까운 알람' }];
    const syncPlan = [
      ...checkPlan,
      { id: '이후 알람' },
    ];
    const createSyncPlan = vi.fn(() => syncPlan);
    const synchronize = vi.fn(async () => true);

    await expect(runAlarmSyncCheck({
      readStatus: async () => ({ scheduledCount: 0 }),
      createPlan: () => checkPlan,
      createSyncPlan,
      shouldSynchronize: () => true,
      synchronize,
    })).resolves.toMatchObject({ success: true, synchronized: true });

    expect(createSyncPlan).toHaveBeenCalledOnce();
    expect(synchronize).toHaveBeenCalledWith(syncPlan);
  });

  it('예약이 정상이면 전체 동기화 계획을 만들지 않아요', async () => {
    const createSyncPlan = vi.fn(() => [{ id: '전체 계획' }]);

    await expect(runAlarmSyncCheck({
      readStatus: async () => ({ scheduledCount: 1 }),
      createPlan: () => [{ id: '가까운 알람' }],
      createSyncPlan,
      shouldSynchronize: () => false,
      synchronize: async () => true,
    })).resolves.toMatchObject({ success: true, synchronized: false });

    expect(createSyncPlan).not.toHaveBeenCalled();
  });

  it('알람을 이미 비운 상태는 네이티브 조회와 계획 계산을 모두 생략해요', async () => {
    const readStatus = vi.fn(async () => ({ scheduledCount: 0 }));
    const createPlan = vi.fn(() => [] as { id: string }[]);
    const synchronize = vi.fn(async () => true);

    await expect(runAlarmSyncCheck({
      skipStatusCheck: true,
      readStatus,
      createPlan,
      shouldSynchronize: () => true,
      synchronize,
    })).resolves.toEqual({
      success: true,
      status: null,
      synchronized: false,
    });
    expect(readStatus).not.toHaveBeenCalled();
    expect(createPlan).not.toHaveBeenCalled();
    expect(synchronize).not.toHaveBeenCalled();
  });

  it('상태 조회 실패를 성공으로 기억하지 않아 다음 요청에서 안전하게 다시 시도해요', async () => {
    const readStatus = vi.fn()
      .mockRejectedValueOnce(new Error('상태 조회 실패'))
      .mockResolvedValueOnce({ scheduledCount: 0 });
    const createPlan = vi.fn(() => [] as { id: string }[]);
    const synchronize = vi.fn(async () => true);
    const run = () => runAlarmSyncCheck({
      readStatus,
      createPlan,
      shouldSynchronize: () => true,
      synchronize,
    });

    await expect(run()).rejects.toThrow('상태 조회 실패');
    expect(createPlan).not.toHaveBeenCalled();
    expect(synchronize).not.toHaveBeenCalled();

    await expect(run()).resolves.toMatchObject({ success: true, synchronized: true });
    expect(readStatus).toHaveBeenCalledTimes(2);
    expect(createPlan).toHaveBeenCalledOnce();
    expect(synchronize).toHaveBeenCalledOnce();
  });
});
