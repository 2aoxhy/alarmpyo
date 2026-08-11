import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** 셸 없이도 현재 npm CLI를 다시 실행할 수 있는 명령과 선행 인자를 찾아요. */
export function resolveNpmInvocation({
  environment = process.env,
  nodePath = process.execPath,
  platform = process.platform,
  fileExists = existsSync,
} = {}) {
  const inheritedCli = environment.npm_execpath;
  const bundledCli = resolve(
    dirname(nodePath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  const cliPath =
    typeof inheritedCli === 'string' && fileExists(inheritedCli)
      ? inheritedCli
      : fileExists(bundledCli)
        ? bundledCli
        : null;

  if (cliPath) {
    return { command: nodePath, prefixArgs: [cliPath] };
  }
  if (platform === 'win32') {
    throw new Error(
      'npm CLI 경로를 찾지 못했어요. 이 명령은 package.json의 npm run 명령으로 실행해 주세요.',
    );
  }
  return { command: 'npm', prefixArgs: [] };
}
