import { describe, expect, it } from 'vitest';

import { resolveNpmInvocation } from '../npm-runtime.mjs';

describe('npm 자식 실행 경로', () => {
  it('npm run이 전달한 CLI를 Node로 실행해 Windows cmd 셸에 의존하지 않아요', () => {
    const invocation = resolveNpmInvocation({
      environment: { npm_execpath: 'C:\\tools\\npm\\bin\\npm-cli.js' },
      nodePath: 'C:\\tools\\node.exe',
      platform: 'win32',
      fileExists: (path) => path === 'C:\\tools\\npm\\bin\\npm-cli.js',
    });

    expect(invocation).toEqual({
      command: 'C:\\tools\\node.exe',
      prefixArgs: ['C:\\tools\\npm\\bin\\npm-cli.js'],
    });
  });

  it('Windows에서 npm CLI가 없으면 모호한 EINVAL 대신 실행 방법을 알려요', () => {
    expect(() =>
      resolveNpmInvocation({
        environment: {},
        nodePath: 'C:\\portable\\node.exe',
        platform: 'win32',
        fileExists: () => false,
      }),
    ).toThrow('npm run 명령으로 실행');
  });
});
