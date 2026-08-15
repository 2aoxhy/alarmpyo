import type { AppData, ShiftType } from '../models/app-data';

import { resolveShiftFromAppData } from './app-data-service';
import {
  requestAlarmPyoWidgetPin,
  syncAlarmPyoWidget,
  type AlarmPyoWidgetPinResult,
} from './alarmpyo-alarm-service';
import {
  buildAlarmPyoWidgetSnapshot,
  type AlarmPyoWidgetSnapshot,
} from './widget-planner';

type WidgetPinDependencies = {
  now?: Date;
  requestPin?: () => Promise<AlarmPyoWidgetPinResult>;
  resolveShift?: (data: AppData, dateKey: string) => ShiftType | null;
  synchronize?: (snapshot: AlarmPyoWidgetSnapshot) => Promise<boolean>;
};

/** 위젯 첫 화면이 비지 않도록 자료 저장을 완료한 뒤 시스템 추가 화면을 열어요. */
export async function requestPreparedAlarmPyoWidgetPin(
  data: AppData,
  dependencies: WidgetPinDependencies = {},
): Promise<AlarmPyoWidgetPinResult> {
  const resolveShift = dependencies.resolveShift ?? resolveShiftFromAppData;
  const snapshot = buildAlarmPyoWidgetSnapshot(
    data,
    (dateKey) => resolveShift(data, dateKey),
    { now: dependencies.now ?? new Date() },
  );
  const synchronized = await (dependencies.synchronize ?? syncAlarmPyoWidget)(snapshot);
  if (!synchronized) {
    throw new Error('위젯 자료를 준비하지 못했습니다.');
  }
  return (dependencies.requestPin ?? requestAlarmPyoWidgetPin)();
}
