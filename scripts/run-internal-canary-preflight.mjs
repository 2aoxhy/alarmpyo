import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { resolveNpmInvocation } from './npm-runtime.mjs';

const root = resolve(import.meta.dirname, '..');
if (
  process.env.ALARMPYO_EAS_NO_VCS === '1' ||
  process.env.EAS_NO_VCS === '1'
) {
  console.error('내부 canary는 EAS의 Git 출처 연결을 끌 수 없어요.');
  process.exit(1);
}
const environment = {
  ...process.env,
  ALARMPYO_DISTRIBUTION: 'direct',
  EXPO_NO_TELEMETRY: '1',
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npm = resolveNpmInvocation({ environment });
const runNpm = (args) => run(npm.command, [...npm.prefixArgs, ...args]);

runNpm(['run', 'release:source']);
runNpm(['run', 'check']);
runNpm(['run', 'audit:dependencies']);
runNpm(['run', 'audit:tooling']);
run(process.execPath, [resolve(root, 'scripts', 'run-expo-doctor.mjs')]);
run(process.execPath, [resolve(root, 'scripts', 'validate-internal-canary.mjs')]);
runNpm(['run', 'test:android-native']);
run(process.execPath, [
  resolve(root, 'scripts', 'run-eas-cli.mjs'),
  'project:info',
]);
