import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EAS_CLI_PACKAGE = 'eas-cli@21.7.0';

export function createEasEnvironment(projectRoot, source = process.env) {
  const configuredGitEntries = Number.parseInt(source.GIT_CONFIG_COUNT ?? '0', 10);
  const gitEntryCount = Number.isInteger(configuredGitEntries)
    ? Math.max(0, configuredGitEntries)
    : 0;
  const environment = {
    ...source,
    GIT_CONFIG_COUNT: String(gitEntryCount + 1),
    [`GIT_CONFIG_KEY_${gitEntryCount}`]: 'safe.directory',
    [`GIT_CONFIG_VALUE_${gitEntryCount}`]: projectRoot,
  };
  if (source.ALARMPYO_EAS_NO_VCS === '1') environment.EAS_NO_VCS = '1';
  else delete environment.EAS_NO_VCS;
  return environment;
}

function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('실행할 EAS 명령을 입력해 주세요.');
    process.exit(1);
  }

  const isWindows = process.platform === 'win32';
  const bundledNpxCli = resolve(
    dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npx-cli.js',
  );
  const projectRoot = resolve(import.meta.dirname, '..');
  // 소스 추적을 잃는 VCS 없는 실행은 긴급 복구 때만 명시적으로 허용해요.
  const environment = createEasEnvironment(projectRoot);

  const result =
    isWindows && existsSync(bundledNpxCli)
      ? spawnSync(
          process.execPath,
          [bundledNpxCli, '--yes', EAS_CLI_PACKAGE, ...args],
          {
            cwd: projectRoot,
            env: environment,
            stdio: 'inherit',
          },
        )
      : spawnSync('npx', ['--yes', EAS_CLI_PACKAGE, ...args], {
          cwd: projectRoot,
          env: environment,
          stdio: 'inherit',
        });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) run();
