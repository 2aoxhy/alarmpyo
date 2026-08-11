import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../services/app-data-service';
import { getAlarmScheduleSignature } from '../../services/alarm-schedule-signature';

import {
  createDataReplacementResult,
  shouldSyncAlarmsAfterReplacement,
  withDeviceBackupResult,
} from '../app-store-persistence';

describe('app-store-persistence', () => {
  it('본문 저장과 후속 처리 결과를 구분해요', () => {
    expect(
      createDataReplacementResult({
        primarySaved: false,
        dataApplied: false,
        followUpSucceeded: false,
      }),
    ).toEqual({
      primarySaved: false,
      operationSucceeded: false,
      announceSuccess: false,
      partialFailure: false,
    });
    expect(
      createDataReplacementResult({
        primarySaved: true,
        dataApplied: true,
        followUpSucceeded: false,
      }),
    ).toEqual({
      primarySaved: true,
      operationSucceeded: true,
      announceSuccess: false,
      partialFailure: true,
    });
    expect(
      createDataReplacementResult({
        primarySaved: true,
        dataApplied: true,
        followUpSucceeded: true,
      }),
    ).toEqual({
      primarySaved: true,
      operationSucceeded: true,
      announceSuccess: true,
      partialFailure: false,
    });
  });

  it('기기 파일 복사본 실패를 저장 완료와 구분해요', () => {
    expect(
      withDeviceBackupResult(
        {
          operationSucceeded: true,
          announceSuccess: true,
          partialFailure: false,
        },
        false,
      ),
    ).toEqual({
      operationSucceeded: true,
      announceSuccess: false,
      partialFailure: true,
      deviceBackupSaved: false,
    });
  });

  it('근무 알람에 영향을 주는 변경만 다시 동기화해요', () => {
    const current = createDefaultAppData('2026-08-09');
    const themeOnly = {
      ...current,
      settings: { ...current.settings, themeMode: 'dark' as const },
    };
    expect(
      shouldSyncAlarmsAfterReplacement({
        current,
        next: themeOnly,
        failedSignature: null,
        force: false,
      }),
    ).toBe(false);

    const alarmChanged = {
      ...current,
      shiftTypes: current.shiftTypes.map((shift) =>
        shift.id === 'day'
          ? { ...shift, alarmMinutesBefore: shift.alarmMinutesBefore + 1 }
          : shift,
      ),
    };
    expect(
      shouldSyncAlarmsAfterReplacement({
        current,
        next: alarmChanged,
        failedSignature: null,
        force: false,
      }),
    ).toBe(true);
    expect(
      shouldSyncAlarmsAfterReplacement({
        current,
        next: current,
        failedSignature: getAlarmScheduleSignature(current),
        force: false,
      }),
    ).toBe(true);
  });
});
