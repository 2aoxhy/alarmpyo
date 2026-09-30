import { describe, expect, it, vi } from 'vitest';
import { createAppSelectorSource } from '../../application/runtime/app-selector-source';
import { createDefaultAppData } from '../../services/app-data-service';
import { areTodayDataEqual, selectTodayData } from './today-store-selection';

describe('Today data subscription', () => {
  it('ignores notes, payroll, saved patterns and unrelated app preferences', () => {
    const data = createDefaultAppData('2026-08-02');
    const source = createAppSelectorSource({ data });
    const subscription = source.createSubscription(selectTodayData, areTodayDataEqual);
    const listener = vi.fn();
    subscription.subscribe(listener);
    source.setSnapshot({ data: {
      ...data, notes: { '2026-08-02': '메모' }, payrollSettings: { ...data.payrollSettings, day: 15 },
      patternVault: [...data.patternVault],
      settings: { ...data.settings, dismissedUpdateVersionCode: 22, widgetDisplayOptions: { todayShift: true, nextShift: false, nextAlarm: true } },
    } });
    expect(subscription.getSnapshot()).toBe(data);
    expect(listener).not.toHaveBeenCalled();
  });

  it('publishes every Today, sleep, routine and alarm input change', () => {
    const data = createDefaultAppData('2026-08-02');
    const variants = [
      { ...data, pattern: { ...data.pattern, anchorDate: '2026-08-03' } },
      { ...data, shiftTypes: [...data.shiftTypes] },
      { ...data, overrides: { '2026-08-02': 'night' } },
      { ...data, timeOverrides: { ...data.timeOverrides } },
      { ...data, dayExceptions: { ...data.dayExceptions } },
      { ...data, alarmOverrides: { ...data.alarmOverrides } },
      ...(['setupCompleted', 'notificationsEnabled', 'sleepReminderEnabled'] as const).map((key) => ({
        ...data, settings: { ...data.settings, [key]: !data.settings[key] },
      })),
      { ...data, settings: { ...data.settings, scheduledNotificationCount: data.settings.scheduledNotificationCount + 1 } },
      { ...data, settings: { ...data.settings, lastNotificationSyncAt: '2026-08-02T00:00:00Z' } },
      { ...data, settings: { ...data.settings, workRoutineProfiles: { ...data.settings.workRoutineProfiles } } },
    ];
    for (const changed of variants) expect(areTodayDataEqual(data, changed)).toBe(false);
  });
});
