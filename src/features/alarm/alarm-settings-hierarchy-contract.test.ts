// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const alarmSettings = readFileSync(
  resolve(process.cwd(), 'src/app/alarm-settings.tsx'),
  'utf8',
);
const permissionChecklist = readFileSync(
  resolve(
    process.cwd(),
    'src/features/alarm/alarm-permission-checklist.tsx',
  ),
  'utf8',
);

describe('알람 설정 화면 정보 구조 계약', () => {
  it('알람 준비, 상태, 다음 알람, 기상·수면 설정, 알람 관리 순서로 표시해요', () => {
    const readiness = alarmSettings.indexOf('<AlarmPermissionChecklist');
    const status = alarmSettings.indexOf('testID="alarm-access-status"');
    const nextAlarm = alarmSettings.indexOf('<MenuGroup title="다음 알람">');
    const sleepReminder = alarmSettings.indexOf('<SleepReminderToggle');
    const wakeTime = alarmSettings.indexOf('title="근무 시작 전 알림"');
    const management = alarmSettings.indexOf('title="알람 관리"');

    expect(readiness).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(readiness);
    expect(nextAlarm).toBeGreaterThan(status);
    expect(wakeTime).toBeGreaterThan(nextAlarm);
    expect(sleepReminder).toBeGreaterThan(wakeTime);
    expect(management).toBeGreaterThan(sleepReminder);
    expect(alarmSettings).toContain(
      'data.settings.notificationsEnabled || scheduledCount > 0',
    );
  });

  it('권한 문제 해결 동작은 상태 카드에서 바로 제공해요', () => {
    const statusCardEnd = alarmSettings.indexOf(
      '<MenuGroup title="다음 알람">',
    );
    const statusCard = alarmSettings.slice(0, statusCardEnd);

    expect(statusCard).toContain('accessSummary.action !== "none"');
    expect(statusCard).toContain('onPress={runAccessAction}');
  });

  it('필수 권한과 시험은 상단에 두고 선택 점검과 부가 기능은 펼침 영역에 모아요', () => {
    const managementBody = alarmSettings.indexOf('{managementOpen ? (');
    const permissions = alarmSettings.indexOf(
      '<AlarmPermissionChecklist',
    );
    const sound = alarmSettings.indexOf('<AlarmSoundSettings />');
    const testAlarm = alarmSettings.indexOf('label={alarmCopy.testAlarm.text}');
    const recentHistory = alarmSettings.indexOf(
      'title="최근 알람 기록"',
    );

    expect(alarmSettings).toContain(
      'const [managementOpen, setManagementOpen] = useState(() =>',
    );
    expect(alarmSettings).toContain("requestedFocus === 'management'");
    expect(alarmSettings).toContain('presentation="next-required"');
    expect(permissionChecklist).toContain("| 'recommended-only'");
    expect(permissionChecklist).toContain("presentation === 'next-required'");
    expect(permissionChecklist).toContain("presentation === 'recommended-only'");
    expect(permissionChecklist).toContain('model.summary');
    expect(permissionChecklist).toContain('model.nextRequiredTarget');
    expect(alarmSettings).toContain('expanded={managementOpen}');
    expect(alarmSettings).toContain(
      'const [historyOpen, setHistoryOpen] = useState(false);',
    );
    expect(alarmSettings).toContain('expanded={historyOpen}');
    expect(permissions).toBeLessThan(managementBody);
    expect(managementBody).toBeGreaterThan(-1);
    expect(testAlarm).toBeLessThan(managementBody);
    expect(sound).toBeGreaterThan(managementBody);
    expect(recentHistory).toBeGreaterThan(sound);
    expect(alarmSettings.match(/<DisclosureRow\b/g)).toHaveLength(1);
  });

  it('권한 조치는 해당 Android 설정 대상으로 직접 연결해요', () => {
    expect(alarmSettings).toContain(
      'openPermissionTarget("exact-alarm")',
    );
    expect(alarmSettings).toContain(
      'openPermissionTarget("alarm-notifications")',
    );
    expect(alarmSettings).toContain(
      'openPermissionTarget("full-screen")',
    );
    expect(alarmSettings).toContain(
      'openPermissionTarget("battery-optimization")',
    );
    expect(alarmSettings).toContain('onOpenSettings={(target) =>');
    expect(alarmSettings).toContain('void openPermissionTarget(target)');
    expect(alarmSettings).toContain(
      'resolveAlarmPermissionLaunchNotice(result)',
    );
    expect(alarmSettings).toContain('runtimeStatus.refresh()');
  });

  it('권한 딥링크는 행만 강조하고 사용자 동작 없이 설정을 열지 않아요', () => {
    expect(alarmSettings).toContain('useLocalSearchParams');
    expect(alarmSettings).toContain('parseAlarmPermissionFocusTarget(target)');
    expect(alarmSettings).toContain('permissionFocusParam !== "permissions"');
    expect(alarmSettings).toContain('permissionFocusRequest.id');
    expect(alarmSettings).toContain('permissionReturnPendingRef.current = true');
    expect(alarmSettings).not.toMatch(
      /useEffect\([\s\S]{0,700}openPermissionSettings\(/,
    );
  });

  it('예약·시험 실패는 다음 미완료 권한으로 직접 연결해요', () => {
    expect(alarmSettings).toContain('const openNextRequiredPermission');
    expect(alarmSettings).toContain("text: '다음 권한 열기'");
    expect(alarmSettings).toContain('onPress: openNextRequiredPermission');
  });

  it('다음 알람에는 이날만 바꾼 기상 시각을 표시해요', () => {
    expect(alarmSettings).toContain('hasDateOverride={Boolean(');
    expect(alarmSettings).toContain('hasDateOverride ? " · 이날만 설정" : ""');
  });

  it('3교대는 실제 사용하는 오후 기상 시각까지 요약해요', () => {
    expect(alarmSettings).toContain(
      'const activeShiftIds = new Set(data.pattern.shiftTypeIds);',
    );
    expect(alarmSettings).toContain('activeShiftIds.has("evening")');
    expect(alarmSettings).toContain('activeShiftIds.has("night")');
    expect(alarmSettings).toContain('activeShiftIds.has("day")');
  });

  it('Android 강제 종료 상태의 알람 한계를 미리 안내해요', () => {
    expect(alarmSettings).toContain(
      '강제 종료 시 알람 중단',
    );
    expect(alarmSettings).toContain(
      '앱을 다시 열 때까지 예약 복구 불가',
    );
  });

  it('권한 행은 큰 글자에서 재배치하고 TalkBack에 동작을 한 번 안내해요', () => {
    expect(permissionChecklist).toContain(
      'shouldReflowControl(width, fontScale) || fontScale >= 1.3',
    );
    expect(permissionChecklist).toContain(
      'accessibilityLabel={`${item.label}. ${item.description}. 설정 열기`}',
    );
    expect(permissionChecklist).toContain(
      'accessibilityHint={`${item.label}에 해당하는 휴대폰 설정 화면을 엽니다.`}',
    );
    expect(permissionChecklist).toContain(
      'AccessibilityInfo.setAccessibilityFocus(node)',
    );
    expect(permissionChecklist).toContain('targetMatchesFocusVisible');
    expect(permissionChecklist).toContain('styles.webFocusVisible');
  });
});
