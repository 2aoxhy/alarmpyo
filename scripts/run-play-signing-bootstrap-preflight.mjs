import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { resolveNpmInvocation } from './npm-runtime.mjs';
import { readPlayReleasePolicy } from './play-release-policy.mjs';
import { assertPlaySigningBootstrapAllowed } from './play-signing-bootstrap.mjs';
import { readReleasePolicy } from './release-policy.mjs';
import { verifyExactToolchain } from './verify-toolchain.mjs';

const root = resolve(import.meta.dirname, '..');
verifyExactToolchain();
const directPolicy = await readReleasePolicy(root, { allowBlocked: true });
const playPolicy = await readPlayReleasePolicy(root, directPolicy, {
  allowBlocked: true,
});
assertPlaySigningBootstrapAllowed({ directPolicy, playPolicy });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ALARMPYO_DISTRIBUTION: 'play',
      EXPO_NO_TELEMETRY: '1',
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npm = resolveNpmInvocation();
const runNpm = (args) => run(npm.command, [...npm.prefixArgs, ...args]);
runNpm(['run', 'release:source']);
runNpm(['run', 'check']);
runNpm(['run', 'audit:dependencies']);
runNpm(['run', 'audit:tooling']);
run(process.execPath, [resolve(root, 'scripts', 'run-expo-doctor.mjs')]);
run(process.execPath, [resolve(root, 'scripts', 'validate-ota-runtime.mjs')]);
runNpm(['run', 'test:android-native']);
run(process.execPath, [resolve(root, 'scripts', 'validate-play-config.mjs')]);
run(process.execPath, [resolve(root, 'scripts', 'verify-play-js-bundle.mjs')]);

console.log(
  'Play App Signing 인증서 확인용 내부 draft AAB 사전 검증을 완료했어요. 이 결과는 제출이나 공개 승격을 허용하지 않아요.',
);
