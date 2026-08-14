// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const alarmSettings = readFileSync(
  resolve(process.cwd(), 'src/app/alarm-settings.tsx'),
  'utf8',
);

describe('알람 설정 화면 정보 구조 계약', () => {
  it('상태, 다음 알람, 수면 알림, 기상 시간, 알람 관리 순서로 표시해요', () => {
    const status = alarmSettings.indexOf('testID="alarm-access-status"');
    const nextAlarm = alarmSettings.indexOf('<MenuGroup title="다음 알람">');
    const sleepReminder = alarmSettings.indexOf('<SleepReminderToggle');
    const wakeTime = alarmSettings.indexOf('title="기상 시간"');
    const management = alarmSettings.indexOf('title="알람 관리"');

    expect(status).toBeGreaterThan(-1);
    expect(nextAlarm).toBeGreaterThan(status);
    expect(sleepReminder).toBeGreaterThan(nextAlarm);
    expect(wakeTime).toBeGreaterThan(sleepReminder);
    expect(management).toBeGreaterThan(wakeTime);
  });

  it('권한 문제 해결 동작은 상태 카드에서 바로 제공해요', () => {
    const statusCardEnd = alarmSettings.indexOf(
      '<MenuGroup title="다음 알람">',
    );
    const statusCard = alarmSettings.slice(0, statusCardEnd);

    expect(statusCard).toContain('accessSummary.action !== "none"');
    expect(statusCard).toContain('onPress={runAccessAction}');
  });

  it('부가 기능은 하나의 알람 관리 펼침 영역에 모아요', () => {
    const managementBody = alarmSettings.indexOf('{managementOpen ? (');
    const sound = alarmSettings.indexOf('<AlarmSoundSettings />');
    const testAlarm = alarmSettings.indexOf('label="시험 알람 울리기"');
    const permissions = alarmSettings.indexOf(
      '<AlarmPermissionChecklist status={alarmStatus} />',
    );
    const recentHistory = alarmSettings.indexOf(
      '<AppText variant="label">최근 알람 기록</AppText>',
    );

    expect(alarmSettings).toContain(
      'const [managementOpen, setManagementOpen] = useState(false);',
    );
    expect(alarmSettings).toContain('expanded={managementOpen}');
    expect(managementBody).toBeGreaterThan(-1);
    expect(sound).toBeGreaterThan(managementBody);
    expect(testAlarm).toBeGreaterThan(sound);
    expect(permissions).toBeGreaterThan(testAlarm);
    expect(recentHistory).toBeGreaterThan(permissions);
    expect(alarmSettings.match(/<DisclosureRow\b/g)).toHaveLength(1);
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
      '강제 종료 상태에서는 알람을 보장할 수 없어요',
    );
    expect(alarmSettings).toContain(
      '앱을 다시 열 때까지 예약 복구와 알람 전달을 보장할 수 없어요.',
    );
  });
});
