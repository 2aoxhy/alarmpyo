import { describe, expect, it, vi } from 'vitest';

import { createDefaultAppData } from '../app-data-service';
import { requestPreparedAlarmPyoWidgetPin } from '../widget-pin-service';
import type { AlarmPyoWidgetSnapshot } from '../widget-planner';

vi.mock('../alarmpyo-alarm-service', () => ({
  requestAlarmPyoWidgetPin: vi.fn(async () => ({
    status: 'requested',
    supported: true,
    installed: false,
  })),
  syncAlarmPyoWidget: vi.fn(async () => true),
}));

describe('위젯 추가 준비', () => {
  it('현재 근무 자료를 먼저 동기화한 뒤 시스템 추가 화면을 요청해요', async () => {
    const calls: string[] = [];
    let firstEntryDate: string | undefined;
    const synchronize = vi.fn(async (snapshot: AlarmPyoWidgetSnapshot) => {
      calls.push('동기화');
      firstEntryDate = snapshot.entries[0]?.dateKey;
      return true;
    });
    const requestPin = vi.fn(async () => {
      calls.push('추가');
      return { status: 'requested' as const, supported: true, installed: false };
    });

    await expect(
      requestPreparedAlarmPyoWidgetPin(createDefaultAppData('2026-07-01'), {
        now: new Date(2026, 6, 13, 10),
        requestPin,
        synchronize,
      }),
    ).resolves.toMatchObject({ status: 'requested' });
    expect(calls).toEqual(['동기화', '추가']);
    expect(firstEntryDate).toBe('2026-07-12');
  });

  it('자료 동기화가 실패하면 빈 위젯을 추가하지 않아요', async () => {
    const requestPin = vi.fn();

    await expect(
      requestPreparedAlarmPyoWidgetPin(createDefaultAppData('2026-07-01'), {
        requestPin,
        synchronize: async () => false,
      }),
    ).rejects.toThrow('위젯 자료를 준비하지 못했어요.');
    expect(requestPin).not.toHaveBeenCalled();
  });
});
