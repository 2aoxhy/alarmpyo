// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Today 알람 권한 설정 흐름', () => {
  it('다음 필수 권한을 시스템 설정으로 바로 연결해요', () => {
    const today = source('src/app/(tabs)/index.tsx');
    const controller = source(
      'src/features/today/use-today-alarm-permission-guide-controller.ts',
    );
    const banner = source(
      'src/features/today/today-alarm-permission-banner.tsx',
    );

    expect(today).toContain('<TodayAlarmPermissionBanner');
    expect(today).toContain('hideAlarmRow={Boolean(permissionGuide.viewModel)}');
    expect(controller).toContain(
      'openAlarmPyoPermissionSettings(viewModel.target)',
    );
    expect(controller).toContain('pendingReturnRef.current');
    expect(controller).toContain('permissionLaunchGateRef.current?.claim()');
    expect(controller).toContain('release(launchToken)');
    expect(banner).toContain('testID="today-alarm-permission-banner"');
  });

  it('별도 AppState 구독 없이 공용 lifecycle 조회를 한 번 재사용해요', () => {
    const controller = source(
      'src/features/today/use-today-alarm-permission-guide-controller.ts',
    );
    const alarmSettings = source('src/app/alarm-settings.tsx');

    expect(controller).toContain('useAppLifecycle()');
    expect(controller).toContain('runtimeStatus.refresh()');
    expect(controller).not.toContain('AppState');
    expect(alarmSettings).toContain('runtimeStatus.refresh().then((snapshot)');
  });

  it('마지막 권한 완료 안내는 revision마다 한 번만 읽어요', () => {
    const banner = source(
      'src/features/today/today-alarm-permission-banner.tsx',
    );
    expect(banner).toContain('announcedCompletionRef');
    expect(banner).toContain('필수 알람 권한 설정 완료');
  });
});
