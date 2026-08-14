import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { resolveNpmInvocation } from './npm-runtime.mjs';
import { readPlayReleasePolicy } from './play-release-policy.mjs';
import { readReleasePolicy } from './release-policy.mjs';
import { verifyExactToolchain } from './verify-toolchain.mjs';

const root = resolve(import.meta.dirname, '..');
verifyExactToolchain();
const directPolicy = await readReleasePolicy(root, { allowBlocked: true });
await readPlayReleasePolicy(root, directPolicy);

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
runNpm(['run', 'release:verify:play-privacy-url']);
runNpm(['run', 'assets:brand:check']);
runNpm([
  'run',
  'release:verify:play-store-assets',
  '--',
  '--allow-missing-screenshots',
]);
runNpm(['run', 'release:source']);
runNpm(['run', 'check']);
runNpm(['run', 'audit:dependencies']);
runNpm(['run', 'audit:tooling']);
run(process.execPath, [resolve(root, 'scripts', 'run-expo-doctor.mjs')]);
run(process.execPath, [resolve(root, 'scripts', 'validate-ota-runtime.mjs')]);
runNpm(['run', 'test:android-native']);
run(process.execPath, [resolve(root, 'scripts', 'validate-play-config.mjs')]);
run(process.execPath, [resolve(root, 'scripts', 'verify-play-js-bundle.mjs')]);
