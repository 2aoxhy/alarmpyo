import { describe, expect, it, vi } from 'vitest';

import { createAppSelectorSource } from '../../application/runtime/app-selector-source';
import { createDefaultAppData } from '../../services/app-data-service';
import type { AppData } from '../../models/app-data';
import { areAlarmSettingsDataEqual, selectAlarmSettingsData } from '../alarm/alarm-store-selection';
import { createDayEditorDataEquality, selectDayEditorData } from '../day-editor/day-editor-store-selection';
import { arePatternLibraryDataEqual, arePatternPreviewDataEqual, selectPatternLibraryData } from '../pattern-library/pattern-library-store-selection';
import {
  areDisplaySettingsDataEqual,
  arePatternEditorDataEqual,
  areSettingsHomeDataEqual,
  areSetupDataEqual,
  areShiftSettingsDataEqual,
  areWorkSettingsHomeDataEqual,
  selectSettingsData,
} from './settings-store-selection';

type DataEquality = (a: AppData, b: AppData) => boolean;

function observe(equal: DataEquality, data = createDefaultAppData('2026-08-02')) {
  const source = createAppSelectorSource({ data });
  const subscription = source.createSubscription(selectSettingsData, equal);
  const listener = vi.fn();
  subscription.subscribe(listener);
  return { data, source, subscription, listener };
}

describe('화면별 데이터 구독 경계', () => {
  it('메모·업데이트 보류만 변경하면 설정·알람·패턴 화면을 깨우지 않습니다', () => {
    for (const equal of [
      areSettingsHomeDataEqual, areWorkSettingsHomeDataEqual, areShiftSettingsDataEqual,
      areSetupDataEqual, arePatternEditorDataEqual, areDisplaySettingsDataEqual,
      areAlarmSettingsDataEqual, arePatternLibraryDataEqual, arePatternPreviewDataEqual,
    ]) {
      const { data, source, subscription, listener } = observe(equal);
      source.setSnapshot({ data: {
        ...data,
        notes: { '2026-08-02': '메모' },
        settings: { ...data.settings, dismissedUpdateVersionCode: 22 },
      } });
      expect(listener, equal.name).not.toHaveBeenCalled();
      expect(subscription.getSnapshot(), equal.name).toBe(data);
    }
  });

  it('설정 홈은 근무·예약 개수만 구독하고 수면·위젯·급여 변경은 제외합니다', () => {
    const { data, source, listener } = observe(areSettingsHomeDataEqual);
    source.setSnapshot({ data: {
      ...data,
      payrollSettings: { ...data.payrollSettings, day: 15 },
      settings: { ...data.settings, sleepReminderEnabled: !data.settings.sleepReminderEnabled,
        widgetDisplayOptions: { ...data.settings.widgetDisplayOptions, nextAlarm: false } },
    } });
    expect(listener).not.toHaveBeenCalled();
    source.setSnapshot({ data: { ...data, settings: {
      ...data.settings, scheduledNotificationCount: data.settings.scheduledNotificationCount + 1,
    } } });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('각 설정 화면은 사용 중인 입력 변경을 빠짐없이 전달합니다', () => {
    const data = createDefaultAppData('2026-08-02');
    const changed = {
      pattern: { ...data, pattern: { ...data.pattern, anchorDate: '2026-08-03' } },
      shifts: { ...data, shiftTypes: [...data.shiftTypes] },
      payroll: { ...data, payrollSettings: { ...data.payrollSettings } },
      routine: { ...data, settings: { ...data.settings, workRoutineProfiles: { ...data.settings.workRoutineProfiles } } },
      alarm: { ...data, settings: { ...data.settings, notificationsEnabled: !data.settings.notificationsEnabled } },
      sync: { ...data, settings: { ...data.settings, lastNotificationSyncAt: '2026-08-02T00:00:00Z' } },
      overrides: { ...data, overrides: { '2026-08-02': 'night' } },
      times: { ...data, timeOverrides: { ...data.timeOverrides } },
      source: { ...data, appliedPatternSource: 'user' as const },
    };
    const cases: [DataEquality, (keyof typeof changed)[]][] = [
      [areSettingsHomeDataEqual, ['pattern', 'shifts', 'alarm']],
      [areWorkSettingsHomeDataEqual, ['pattern', 'shifts', 'alarm', 'payroll', 'sync']],
      [areShiftSettingsDataEqual, ['pattern', 'shifts', 'payroll', 'routine']],
      [areSetupDataEqual, ['pattern', 'shifts', 'alarm']],
      [arePatternEditorDataEqual, ['pattern', 'shifts', 'alarm', 'overrides', 'times', 'source']],
    ];
    for (const [equal, fields] of cases) {
      for (const field of fields) {
        const { source, listener } = observe(equal, data);
        source.setSnapshot({ data: changed[field] });
        expect(listener, `${equal.name}:${field}`).toHaveBeenCalledOnce();
      }
    }
  });

  it('위젯 준비와 알람 화면은 모든 일정 입력을 구독합니다', () => {
    const data = createDefaultAppData('2026-08-02');
    for (const equal of [areDisplaySettingsDataEqual, areAlarmSettingsDataEqual]) {
      for (const key of ['pattern', 'shiftTypes', 'overrides', 'timeOverrides', 'dayExceptions', 'alarmOverrides'] as const) {
        const { source, listener } = observe(equal, data);
        source.setSnapshot({ data: { ...data, [key]: Array.isArray(data[key]) ? [...data[key]] : { ...data[key] } } });
        expect(listener, `${equal.name}:${key}`).toHaveBeenCalledOnce();
      }
    }
    expect(areDisplaySettingsDataEqual(data, { ...data, settings: {
      ...data.settings, widgetDisplayOptions: { ...data.settings.widgetDisplayOptions, nextAlarm: false },
    } })).toBe(false);
    expect(areAlarmSettingsDataEqual(data, { ...data, settings: {
      ...data.settings, workRoutineProfiles: { ...data.settings.workRoutineProfiles },
    } })).toBe(false);
  });

  it('날짜 편집은 다른 날짜의 직접 변경·메모로 초안을 다시 계산하지 않습니다', () => {
    const { data, source, listener } = observe(createDayEditorDataEquality('2026-08-02'));
    source.setSnapshot({ data: { ...data,
      overrides: { '2026-08-03': 'night' }, notes: { '2026-08-03': '다른 날짜' },
    } });
    expect(listener).not.toHaveBeenCalled();
    source.setSnapshot({ data: { ...data, overrides: { '2026-08-02': null } } });
    expect(listener).toHaveBeenCalledOnce();
    source.setSnapshot({ data: { ...data, notes: { '2026-08-02': '현재 날짜' } } });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('보관함·적용 비교는 각각 필요한 패턴 이력과 일정 입력을 구독합니다', () => {
    const data = createDefaultAppData('2026-08-02');
    expect(arePatternLibraryDataEqual(data, { ...data, patternHistory: [...data.patternHistory] })).toBe(false);
    expect(arePatternLibraryDataEqual(data, { ...data, overrides: { '2026-08-02': 'night' } })).toBe(true);
    expect(arePatternPreviewDataEqual(data, { ...data, overrides: { '2026-08-02': 'night' } })).toBe(false);
    expect(arePatternPreviewDataEqual(data, { ...data, patternHistory: [...data.patternHistory] })).toBe(true);
    for (const selector of [selectSettingsData, selectAlarmSettingsData, selectDayEditorData, selectPatternLibraryData]) {
      expect(selector({ data })).toBe(data);
    }
  });
});
