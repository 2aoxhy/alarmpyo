import { getExpectedNativeScheduledAlarmCount } from './alarm-sync-policy';
import type { AlarmPyoAlarmStatus } from './alarmpyo-alarm-service';

export type AlarmPyoSafetyIssueCode =
  | 'status-unavailable'
  | 'alarm-permissions'
  | 'do-not-disturb'
  | 'battery-optimization'
  | 'alarm-volume'
  | 'alarm-storage'
  | 'alarm-schedule'
  | 'alarm-plan-expiry'
  | 'widget-snapshot';

// 위젯은 366일 스냅샷을 자체 계산하므로 이틀마다 앱을 열라고 경고하지 않아요.
// 마지막 16일의 여유 구간에 들어갔을 때만 한 번 갱신을 안내해요.
export const WIDGET_SNAPSHOT_MAX_AGE_MS = 350 * 24 * 60 * 60 * 1000;
const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
const PERSISTED_SAFETY_CODE_MAP: Readonly<Record<string, AlarmPyoSafetyIssueCode>> = {
  'exact-alarm': 'alarm-permissions',
  'full-screen': 'alarm-permissions',
  notifications: 'alarm-permissions',
  'do-not-disturb': 'do-not-disturb',
  'battery-optimization': 'battery-optimization',
  'alarm-volume': 'alarm-volume',
  schedule: 'alarm-schedule',
  storage: 'alarm-storage',
};

export type AlarmPyoSafetyIssue = {
  code: AlarmPyoSafetyIssueCode;
  priority: number;
  title: string;
  detail: string;
};

export type AlarmPyoSafetyCheckInput = {
  notificationsEnabled: boolean;
  plannedAlarmCount: number;
  status: AlarmPyoAlarmStatus | null;
  statusError?: boolean;
  now?: number;
};

function permissionIssue(status: AlarmPyoAlarmStatus): AlarmPyoSafetyIssue | null {
  const missing = [
    !status.exactAlarmAllowed ? '정확한 알람' : null,
    !status.fullScreenAllowed ? '전체 화면 알람' : null,
    !status.notificationsAllowed ? '알림' : null,
  ].filter((label): label is string => label !== null);
  if (missing.length === 0) return null;
  return {
    code: 'alarm-permissions',
    priority: 10,
    title: '알람 권한을 확인해야 합니다',
    detail: `${missing.join('·')} 권한이 꺼져 있습니다.`,
  };
}

function scheduleIssue(
  status: AlarmPyoAlarmStatus,
  plannedAlarmCount: number,
): AlarmPyoSafetyIssue | null {
  // 권한이 없으면 네이티브가 예약을 비우는 것이 정상이에요. 이때는 권한 문제만
  // 안내하고 예약 수까지 연달아 경고하지 않아요.
  if (!status.exactAlarmAllowed || !status.notificationsAllowed) return null;

  const expectedCount = getExpectedNativeScheduledAlarmCount({
    exactAlarmAllowed: status.exactAlarmAllowed,
    notificationsAllowed: status.notificationsAllowed,
    plannedAlarmCount,
  });
  const countMismatch = status.scheduledCount !== expectedCount;
  const listMismatch = status.scheduledAlarms.length !== status.scheduledCount;
  if (!countMismatch && !listMismatch) return null;

  let detail: string;
  if (listMismatch) {
    detail = '예약 정보가 서로 맞지 않아 다시 동기화해야 합니다.';
  } else if (expectedCount === 0) {
    detail = `예정된 근무는 없지만 알람 ${status.scheduledCount}개가 남아 있습니다.`;
  } else {
    detail = `다음 알람 ${expectedCount}개 중 ${status.scheduledCount}개만 예약됐습니다.`;
  }
  return {
    code: 'alarm-schedule',
    priority: 30,
    title: '알람 예약을 다시 확인해야 합니다',
    detail,
  };
}

function persistedSafetyIssues(status: AlarmPyoAlarmStatus): AlarmPyoSafetyIssue[] {
  // 알림 권한이 막힌 동안에는 백그라운드 점검 결과를 알림으로 전달할 수 없어요.
  // 이때만 저장된 결과를 전경 점검에 합치고, 권한이 복구되면 현재 상태만 사용해요.
  if (status.notificationsAllowed || !status.alarmSafety) return [];
  const mappedCodes = new Set(
    status.alarmSafety.issueCodes
      .map((code) => PERSISTED_SAFETY_CODE_MAP[code])
      .filter((code): code is AlarmPyoSafetyIssueCode => code !== undefined),
  );
  const issues: AlarmPyoSafetyIssue[] = [];
  if (mappedCodes.has('alarm-permissions')) {
    issues.push(
      permissionIssue(status) ?? {
        code: 'alarm-permissions',
        priority: 10,
        title: '알람 권한을 확인해야 합니다',
        detail: '백그라운드 안전 점검에서 알람 권한 문제를 확인했습니다.',
      },
    );
  }
  if (mappedCodes.has('do-not-disturb')) {
    issues.push({
      code: 'do-not-disturb',
      priority: 15,
      title: '방해 금지에서 알람을 확인해야 합니다',
      detail: '백그라운드 안전 점검에서 근무 알람 소리가 차단될 수 있음을 확인했습니다.',
    });
  }
  if (mappedCodes.has('alarm-volume')) {
    issues.push({
      code: 'alarm-volume',
      priority: 20,
      title: '알람 음량을 높여야 합니다',
      detail: '백그라운드 안전 점검에서 알람 음량 문제를 확인했습니다.',
    });
  }
  if (mappedCodes.has('alarm-storage')) {
    issues.push({
      code: 'alarm-storage',
      priority: 25,
      title: '알람 저장 정보를 다시 확인해야 합니다',
      detail: '백그라운드 안전 점검에서 알람 저장 정보 문제를 확인했습니다.',
    });
  }
  if (mappedCodes.has('alarm-schedule')) {
    issues.push({
      code: 'alarm-schedule',
      priority: 30,
      title: '알람 예약을 다시 확인해야 합니다',
      detail: '백그라운드 안전 점검에서 알람 예약 불일치를 확인했습니다.',
    });
  }
  if (mappedCodes.has('battery-optimization')) {
    issues.push({
      code: 'battery-optimization',
      priority: 40,
      title: '배터리 사용 제한을 확인해야 합니다',
      detail: '백그라운드 안전 점검에서 배터리 사용 제한 문제를 확인했습니다.',
    });
  }
  return issues;
}

/**
 * 앱 복귀 시 기존 동기화가 읽은 네이티브 상태만으로 점검해요.
 * 별도 타이머나 백그라운드 폴링을 만들지 않아요.
 */
export function getAlarmPyoSafetyIssues({
  notificationsEnabled,
  plannedAlarmCount,
  status,
  statusError = false,
  now = Date.now(),
}: AlarmPyoSafetyCheckInput): AlarmPyoSafetyIssue[] {
  if (!Number.isFinite(now)) throw new RangeError('안전 점검 기준 시각이 올바르지 않습니다.');
  if (!Number.isInteger(plannedAlarmCount) || plannedAlarmCount < 0) {
    throw new RangeError('예정된 알람 개수가 올바르지 않습니다.');
  }

  if (!status) {
    return statusError && notificationsEnabled
      ? [{
          code: 'status-unavailable',
          priority: 5,
          title: '알람 상태를 확인할 수 없습니다',
          detail: '알람 설정에서 권한을 확인한 뒤 다시 시도해야 합니다.',
        }]
      : [];
  }

  const issues: AlarmPyoSafetyIssue[] = [];
  // 알람을 사용하지 않으면 권한·음량·예약 상태는 의도된 비활성 상태예요.
  if (notificationsEnabled) {
    if (!status.supported) {
      issues.push({
        code: 'status-unavailable',
        priority: 5,
        title: '알람 상태를 확인할 수 없습니다',
        detail: '현재 설치본에서 알람표 알람을 사용할 수 있는지 확인해야 합니다.',
      });
    } else {
      const permissions = permissionIssue(status);
      if (permissions) issues.push(permissions);
      if (status.doNotDisturbMaySilenceAlarm) {
        issues.push({
          code: 'do-not-disturb',
          priority: 15,
          title: '방해 금지에서 알람을 확인해야 합니다',
          detail: '현재 설정에서는 근무 알람 소리가 차단될 수 있습니다.',
        });
      }
      if (!status.batteryOptimizationIgnored) {
        issues.push({
          code: 'battery-optimization',
          priority: 40,
          title: '배터리 사용 제한을 확인해야 합니다',
          detail:
            '알람표를 오래 열지 않아도 안정적으로 울리도록 배터리 사용을 제한하지 않음으로 설정해야 합니다.',
        });
      }
      if (status.alarmVolume <= 0) {
        issues.push({
          code: 'alarm-volume',
          priority: 20,
          title: '알람 음량을 높여야 합니다',
          detail: '현재 알람 음량이 0이라 소리가 나지 않습니다.',
        });
      }
      const schedule = scheduleIssue(status, plannedAlarmCount);
      if (schedule) issues.push(schedule);
      if (
        status.planRefreshReminderPending &&
        status.planRefreshRecommendedAt > 0 &&
        now >= status.planRefreshRecommendedAt
      ) {
        issues.push({
          code: 'alarm-plan-expiry',
          priority: 35,
          title: '알람 계획을 이어서 예약해야 합니다',
          detail: '알람표를 열어 저장된 근무표로 다음 366일 알람 계획을 갱신해야 합니다.',
        });
      }
      issues.push(...persistedSafetyIssues(status));
    }
  }

  // 위젯은 선택 기능이라 미설치는 정상이에요. 설치된 경우에만 누락·오래됨과
  // 휴대폰 시각 오류로 생긴 미래 스냅샷을 낮은 우선순위로 알려요.
  if (status.supported && status.widgetInstalled) {
    const generatedAt = status.widgetSnapshotGeneratedAt;
    const invalidSnapshot =
      generatedAt <= 0 ||
      generatedAt > now + FUTURE_CLOCK_TOLERANCE_MS ||
      now - generatedAt > WIDGET_SNAPSHOT_MAX_AGE_MS;
    if (invalidSnapshot) {
      issues.push({
        code: 'widget-snapshot',
        priority: 90,
        title: '홈 화면 위젯을 갱신해야 합니다',
        detail: '알람표를 다시 열어 최신 근무 정보를 위젯에 반영해야 합니다.',
      });
    }
  }
  return issues
    .filter(
      (issue, index, allIssues) =>
        allIssues.findIndex((candidate) => candidate.code === issue.code) === index,
    )
    .sort((left, right) => left.priority - right.priority);
}
