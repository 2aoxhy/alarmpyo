import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../services/app-data-service';
// @ts-expect-error Vitest는 Store 경계 회귀를 소스 계약으로 확인해요.
import providerSource from '../../store/app-store.tsx?raw';

import {
  analyzeAppDataScheduleSafety,
  enforceAppDataScheduleSafety,
} from '../app-store-schedule-safety';

function shift(data: ReturnType<typeof createDefaultAppData>, id: string) {
  const value = data.shiftTypes.find((item) => item.id === id);
  if (!value) throw new Error(`missing shift: ${id}`);
  return value;
}

describe('Store 일정 안전 경계', () => {
  it('겹치는 근무는 저장 후보를 거부해요', () => {
    const data = createDefaultAppData('2026-08-15');
    data.pattern = {
      name: '겹치는 근무',
      anchorDate: '2026-08-15',
      scheduleStartDate: '2026-08-15',
      shiftTypeIds: ['day', 'night'],
    };
    Object.assign(shift(data, 'day'), {
      startMinutes: 19 * 60,
      endMinutes: 8 * 60,
      endsNextDay: true,
    });
    Object.assign(shift(data, 'night'), {
      startMinutes: 7 * 60,
      endMinutes: 19 * 60,
      endsNextDay: false,
    });

    const result = enforceAppDataScheduleSafety(data);

    expect(result.data).toBeNull();
    expect(result.safety.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'work-overlap' })]),
    );
  });

  it('근무는 유효하지만 다음 기상 알람이 이전 근무 중이면 알람만 꺼요', () => {
    const data = createDefaultAppData('2026-08-15');
    data.pattern = {
      name: '2조 2교대',
      anchorDate: '2026-08-15',
      scheduleStartDate: '2026-08-15',
      shiftTypeIds: ['day', 'night'],
    };
    data.settings.notificationsEnabled = true;
    data.settings.scheduledNotificationCount = 2;
    data.settings.lastNotificationSyncAt = '2026-08-15T00:00:00.000Z';
    Object.assign(shift(data, 'day'), {
      startMinutes: 7 * 60,
      endMinutes: 19 * 60,
      alarmEnabled: true,
      alarmMinutesBefore: 110,
    });
    Object.assign(shift(data, 'night'), {
      startMinutes: 19 * 60,
      endMinutes: 7 * 60,
      endsNextDay: true,
      alarmEnabled: true,
      alarmMinutesBefore: 110,
    });

    const result = enforceAppDataScheduleSafety(data);

    expect(result.data).not.toBeNull();
    expect(result.alarmsDisabled).toBe(true);
    expect(result.data?.settings).toMatchObject({
      notificationsEnabled: false,
      scheduledNotificationCount: 2,
      lastNotificationSyncAt: null,
    });
    expect(result.safety.canEnableAlarms).toBe(false);
  });

  it('알람을 켜도 안전한 일정은 그대로 유지해요', () => {
    const data = createDefaultAppData('2026-08-15');
    const result = enforceAppDataScheduleSafety(data);
    expect(result.data).toBe(data);
    expect(result.safety.canSave).toBe(true);
  });

  it('legacy shift ID가 있는 기존 백업은 보존하되 알람을 fail-closed로 막아요', () => {
    const data = createDefaultAppData('2026-08-15');
    data.pattern.shiftTypeIds = ['legacy-evening', 'off'];
    data.settings.notificationsEnabled = true;

    expect(analyzeAppDataScheduleSafety(data)).toMatchObject({
      canSave: true,
      canEnableAlarms: false,
      unsupportedShiftTypeIds: ['legacy-evening'],
    });
    const enforced = enforceAppDataScheduleSafety(data);
    expect(enforced.data?.pattern).toEqual(data.pattern);
    expect(enforced.data?.settings.notificationsEnabled).toBe(false);
    expect(enforced.alarmsDisabled).toBe(true);
  });

  it('load·import·restore ingress는 잘못된 근무도 잃지 않고 알람만 꺼요', () => {
    const data = createDefaultAppData('2026-08-15');
    data.pattern.shiftTypeIds = ['night', 'day'];
    data.settings.notificationsEnabled = true;
    Object.assign(shift(data, 'night'), {
      startMinutes: 18 * 60,
      endMinutes: 7 * 60,
      endsNextDay: true,
      alarmEnabled: false,
    });
    Object.assign(shift(data, 'day'), {
      startMinutes: 6 * 60,
      endMinutes: 18 * 60,
      endsNextDay: false,
      alarmEnabled: false,
    });

    const enforced = enforceAppDataScheduleSafety(data, { mode: 'ingress' });

    expect(enforced.safety.canSave).toBe(false);
    expect(enforced.data?.pattern).toEqual(data.pattern);
    expect(enforced.data?.settings.notificationsEnabled).toBe(false);
  });

  it('모든 저장·복원·동기화 경계가 중앙 안전 검사를 우회하지 않아요', () => {
    expect(providerSource).toContain("mode: 'ingress'");
    expect(providerSource).toContain('focusDateKeys: [dateKey]');
    expect(providerSource).toContain('focusDateKeys: dateKeys');
    expect(providerSource).toContain('const syncSnapshot = enforcedScheduleSafety.data');
    expect(providerSource).toContain('const latestSafety = analyzeAppDataScheduleSafety(candidate)');
    expect(providerSource).toContain('Object.is(replacementData, current)');
  });
});
