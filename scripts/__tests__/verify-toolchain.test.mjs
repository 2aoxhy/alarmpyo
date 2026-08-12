import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertExactToolchain,
  REQUIRED_NODE_VERSION,
  REQUIRED_NPM_VERSION,
  verifyExactToolchain,
} from '../verify-toolchain.mjs';

describe('릴리스 도구 버전 검사', () => {
  it('저장소가 선언한 Node.js와 npm 버전을 단일 검사 값으로 사용해요', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    const eas = JSON.parse(readFileSync(resolve('eas.json'), 'utf8'));

    expect(REQUIRED_NODE_VERSION).toBe(pkg.engines.node);
    expect(REQUIRED_NODE_VERSION).toBe(
      readFileSync(resolve('.node-version'), 'utf8').trim(),
    );
    expect(REQUIRED_NODE_VERSION).toBe(eas.build.base.node);
    expect(REQUIRED_NPM_VERSION).toBe(pkg.engines.npm);
    expect(pkg.packageManager).toBe(`npm@${REQUIRED_NPM_VERSION}`);
  });

  it('Node.js와 npm이 고정 버전과 정확히 같을 때만 통과해요', () => {
    expect(
      assertExactToolchain({
        nodeVersion: `v${REQUIRED_NODE_VERSION}`,
        npmVersion: `${REQUIRED_NPM_VERSION}\n`,
      }),
    ).toEqual({
      nodeVersion: REQUIRED_NODE_VERSION,
      npmVersion: REQUIRED_NPM_VERSION,
    });

    expect(() =>
      assertExactToolchain({
        nodeVersion: '24.16.1',
        npmVersion: REQUIRED_NPM_VERSION,
      }),
    ).toThrow(`Node.js ${REQUIRED_NODE_VERSION}`);
    expect(() =>
      assertExactToolchain({
        nodeVersion: REQUIRED_NODE_VERSION,
        npmVersion: '11.13.1',
      }),
    ).toThrow(`npm ${REQUIRED_NPM_VERSION}`);
  });

  it('현재 npm CLI의 실제 버전을 읽어 검사해요', () => {
    const calls = [];
    const result = verifyExactToolchain({
      nodeVersion: REQUIRED_NODE_VERSION,
      npmInvocation: {
        command: 'C:\\tools\\node.exe',
        prefixArgs: ['C:\\tools\\npm-cli.js'],
      },
      spawn(command, args, options) {
        calls.push({ command, args, options });
        return { status: 0, stdout: `${REQUIRED_NPM_VERSION}\n` };
      },
    });

    expect(result).toEqual({
      nodeVersion: REQUIRED_NODE_VERSION,
      npmVersion: REQUIRED_NPM_VERSION,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].args.at(-1)).toBe('--version');
  });

  it('npm 버전을 읽지 못하면 릴리스 검사를 중단해요', () => {
    expect(() =>
      verifyExactToolchain({
        nodeVersion: REQUIRED_NODE_VERSION,
        npmInvocation: {
          command: 'C:\\tools\\node.exe',
          prefixArgs: ['C:\\tools\\npm-cli.js'],
        },
        spawn: () => ({ status: 1, stdout: '' }),
      }),
    ).toThrow('npm 버전을 확인하지 못했어요');
  });
});
