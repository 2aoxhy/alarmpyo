// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dataSettingsSource = readFileSync(
  resolve(process.cwd(), 'src/app/data-settings.tsx'),
  'utf8',
);

describe('외부 백업 내보내기 안내', () => {
  it('공유 화면을 취소해도 저장 성공이나 앱 삭제 뒤 보존을 단정하지 않아요', () => {
    expect(dataSettingsSource).toContain("result.storageStatus === 'saved'");
    expect(dataSettingsSource).toContain("result.storageStatus === 'cancelled'");
    expect(dataSettingsSource).toContain('백업 화면 종료');
    expect(dataSettingsSource).toContain('저장 여부 확인');
    expect(dataSettingsSource).not.toContain('앱을 삭제해도 남아요');
    expect(dataSettingsSource).not.toContain('앱을 삭제해도 남도록');
  });

  it('평문과 암호화 내보내기를 모두 저장 성공이 아닌 시도로 기록해요', () => {
    const recordAttemptCalls = dataSettingsSource.match(
      /await recordBackupExportAttempt\(\);/g,
    );

    expect(recordAttemptCalls).toHaveLength(2);
    expect(dataSettingsSource).not.toContain('recordExternalBackupPrepared');
  });

  it('근무 설정 확인에서 오후 ID와 구형 파일 보존 동작을 명확히 안내해요', () => {
    expect(dataSettingsSource).toContain("evening: '오'");
    expect(dataSettingsSource).toContain(
      "doesWorkSettingsPreviewApplyEvening(preview)",
    );
    expect(dataSettingsSource).toContain(
      "formatSharedShiftLine('오후', summary.evening)",
    );
    expect(dataSettingsSource).toContain(
      '현재 휴대전화 설정 유지 (구형 파일에는 오후 설정이 없습니다)',
    );
  });

  it('복구 전에 모든 날짜별 변경 종류와 양쪽 알람 상태를 같은 기준으로 비교해요', () => {
    for (const field of [
      'store.data.overrides',
      'store.data.timeOverrides',
      'store.data.dayExceptions',
      'store.data.alarmOverrides',
    ]) {
      expect(dataSettingsSource).toContain(`...Object.keys(${field})`);
    }
    expect(dataSettingsSource).toContain('summary.notificationsEnabled');
    expect(dataSettingsSource).toContain("'알람 켜짐' : '알람 꺼짐'");
  });

  it('백업 비밀번호 팝업을 닫으면 실행한 백업 행으로 초점을 복원해요', () => {
    expect(dataSettingsSource).toContain('elementRef={encryptedBackupTriggerRef}');
    expect(dataSettingsSource).toContain('elementRef={backupFileRestoreTriggerRef}');
    expect(dataSettingsSource).toContain('returnFocusRef={');
  });
});
