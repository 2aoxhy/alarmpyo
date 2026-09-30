import { describe, expect, it, vi } from 'vitest';

import { prepareQuickSetupAlarmReadiness } from './quick-setup-alarm-preparation';

describe('간편 설정 알람 준비', () => {
  it('이미 켜진 알람은 다시 켜지 않고 권한 확인을 계속합니다', async () => {
    const enableAlarms = vi.fn<() => Promise<boolean>>();

    await expect(
      prepareQuickSetupAlarmReadiness(true, enableAlarms),
    ).resolves.toEqual({ status: 'ready', enabledNow: false });
    expect(enableAlarms).not.toHaveBeenCalled();
  });

  it('알람 켜기의 boolean 결과를 권한 화면 이동 가능 여부로 구분합니다', async () => {
    await expect(
      prepareQuickSetupAlarmReadiness(false, async () => true),
    ).resolves.toEqual({ status: 'ready', enabledNow: true });
    await expect(
      prepareQuickSetupAlarmReadiness(false, async () => false),
    ).resolves.toEqual({ status: 'enable-failed' });
  });

  it('알람 켜기 예외를 처리된 상태로 반환합니다', async () => {
    await expect(
      prepareQuickSetupAlarmReadiness(false, async () => {
        throw new Error('native failure');
      }),
    ).resolves.toEqual({ status: 'error' });
  });
});
