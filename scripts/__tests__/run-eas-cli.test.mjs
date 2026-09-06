import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createEasEnvironment } from '../run-eas-cli.mjs';

describe('EAS 실행 환경', () => {
  it('Git에서 제외한 첨부·기록·인증 파일을 EAS 업로드에서도 제외해요', () => {
    const rules = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    // EAS uses .easignore instead of .gitignore when both exist.
    const gitRules = rules('.gitignore');
    const easRules = new Set(rules('.easignore'));
    expect(gitRules.filter((rule) => !easRules.has(rule))).toEqual([]);
    expect(easRules.has('.codex-remote-attachments/')).toBe(true);
    expect(easRules.has('.artifacts/')).toBe(true);
    expect(easRules.has('.release/')).toBe(true);
  });

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
