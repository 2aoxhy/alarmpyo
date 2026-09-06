import { describe, expect, it, vi } from 'vitest';
import { createAppSelectorSource } from '../../application/runtime/app-selector-source';
import { createDefaultAppData } from '../../services/app-data-service';
import { buildCalendarMonthViewModel } from '../../services/calendar-month-view-model';
import { areCalendarStoreDataEqual, selectCalendarStoreData } from './calendar-store-selection';

describe('calendar projection subscription', () => {
  it('keeps the exact projection for alarm, widget, vault and UI-only changes', () => {
    const data = createDefaultAppData('2026-08-02');
    const source = createAppSelectorSource({ data, ui: 'closed' });
    const subscription = source.createSubscription(selectCalendarStoreData, areCalendarStoreDataEqual);
    const projection = subscription.getSnapshot();
    const rebuild = vi.fn(() => buildCalendarMonthViewModel({
      data: subscription.getSnapshot(), year: 2026, month: 7, windowWidth: 390, fontScale: 1,
      automaticScheduleReferenceDateKey: '2026-08-02',
    }));
    subscription.subscribe(rebuild);
    source.setSnapshot({ data, ui: 'summary' });
    source.setSnapshot({ data: { ...data, settings: { ...data.settings, notificationsEnabled: !data.settings.notificationsEnabled } }, ui: 'selection' });
    source.setSnapshot({ data: { ...data, patternVault: [...data.patternVault] }, ui: 'legend' });
    expect(subscription.getSnapshot()).toBe(projection);
    expect(rebuild).not.toHaveBeenCalled();
    source.setSnapshot({ data: { ...data, notes: { '2026-08-02': '메모' } }, ui: 'closed' });
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(subscription.getSnapshot().notes['2026-08-02']).toBe('메모');
  });
});
