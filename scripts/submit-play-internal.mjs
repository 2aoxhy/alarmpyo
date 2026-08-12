import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveNpmInvocation } from './npm-runtime.mjs';
import { validatePlayAab } from './validate-play-aab.mjs';

const root = resolve(import.meta.dirname, '..');

function parseAabPath(argv) {
  const index = argv.findIndex((value) => value === '--aab');
  if (index >= 0) return argv[index + 1];
  const inline = argv.find((value) => value.startsWith('--aab='));
  return inline?.slice('--aab='.length) || process.env.ALARMPYO_AAB_PATH;
}

function parseValue(argv, name, environmentName) {
  const index = argv.findIndex((value) => value === name);
  if (index >= 0) return argv[index + 1];
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  return inline?.slice(name.length + 1) || process.env[environmentName];
}

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const aabPath = parseAabPath(process.argv.slice(2));
  if (!aabPath) {
    throw new Error('--aab 또는 ALARMPYO_AAB_PATH로 제출할 AAB 파일을 지정해 주세요.');
  }
  const defaultEvidence = resolve('.release', 'eas-build-play.json');
  const easBuildEvidencePath =
    parseValue(process.argv.slice(2), '--eas-build', 'ALARMPYO_EAS_BUILD_EVIDENCE') ||
    (existsSync(resolve(root, defaultEvidence)) ? defaultEvidence : null);
  if (!easBuildEvidencePath) {
    throw new Error(
      '`eas build:view <빌드 ID> --json` 결과를 .release/eas-build-play.json에 저장하거나 --eas-build로 지정해 주세요.',
    );
  }

  const environment = {
    ...process.env,
    ALARMPYO_DISTRIBUTION: 'play',
    EXPO_NO_TELEMETRY: '1',
  };
  const npm = resolveNpmInvocation({ environment });
  run(
    npm.command,
    [...npm.prefixArgs, 'run', 'release:preflight:play'],
    environment,
  );

  const provenanceOut = resolve(
    '.release',
    'play',
    `${basename(aabPath)}.provenance.json`,
  );
  const artifact = await validatePlayAab({
    aabPath,
    provenanceOut,
    easBuildEvidencePath,
    requireCleanSource: true,
  });
  console.log(`제출 전 AAB 검증을 완료했어요. SHA-256 ${artifact.sha256}`);

  run(
    process.execPath,
    [
      resolve(root, 'scripts', 'run-eas-cli.mjs'),
      'submit',
      '--platform',
      'android',
      '--profile',
      'internal',
      '--path',
      resolve(root, aabPath),
      '--non-interactive',
      '--wait',
    ],
    environment,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
