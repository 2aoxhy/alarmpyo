import { describe, expect, it } from 'vitest';

import { createEasEnvironment } from '../run-eas-cli.mjs';

describe('EAS 실행 환경', () => {
  it('프로젝트 경로를 안전한 Git 저장소로 전달하고 VCS를 기본 활성화해요', () => {
    const environment = createEasEnvironment('C:/work/AlarmPyo', {
      EAS_NO_VCS: '1',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.sslVerify',
      GIT_CONFIG_VALUE_0: 'true',
    });

    expect(environment.EAS_NO_VCS).toBeUndefined();
    expect(environment.GIT_CONFIG_COUNT).toBe('2');
    expect(environment.GIT_CONFIG_KEY_1).toBe('safe.directory');
    expect(environment.GIT_CONFIG_VALUE_1).toBe('C:/work/AlarmPyo');
  });

  it('긴급 복구 플래그를 명시한 경우에만 VCS 없는 실행을 허용해요', () => {
    const environment = createEasEnvironment('C:/work/AlarmPyo', {
      ALARMPYO_EAS_NO_VCS: '1',
    });

    expect(environment.EAS_NO_VCS).toBe('1');
  });
});
