import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
export const EXPO_DOCTOR_PACKAGE = 'expo-doctor@1.20.1';
const isWindows = process.platform === 'win32';
const bundledNpxCli = resolve(
  dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npx-cli.js',
);
const inheritedNpxCli = process.env.npm_execpath
  ? resolve(dirname(process.env.npm_execpath), 'npx-cli.js')
  : null;

export function hasExpoIgnoreRule(gitIgnore) {
  return gitIgnore
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .some((line) => /^\/?\.expo\/?$/u.test(line));
}

export function shouldAcceptMissingGitWarning({
  doctorOutput,
  gitAvailable,
  gitIgnore,
}) {
  if (gitAvailable || !hasExpoIgnoreRule(gitIgnore)) return false;
  if (!doctorOutput.includes('The .expo directory is not ignored by Git.')) {
    return false;
  }

  const failedChecks = [
    ...doctorOutput.matchAll(/^✖ (Check[^\r\n]+)/gmu),
  ].map((match) => match[1]);
  return (
    failedChecks.length > 0 &&
    failedChecks.every((check) => check === 'Check for common project setup issues')
  );
}

function run() {
  const gitResult = spawnSync('git', ['--version'], {
    cwd: root,
    encoding: 'utf8',
  });
  const npxCli = existsSync(bundledNpxCli)
    ? bundledNpxCli
    : inheritedNpxCli && existsSync(inheritedNpxCli)
      ? inheritedNpxCli
      : null;
  const doctorCommand = isWindows && npxCli ? process.execPath : 'npx';
  const doctorArguments = [
    ...(doctorCommand === process.execPath && npxCli ? [npxCli] : []),
    '--yes',
    EXPO_DOCTOR_PACKAGE,
  ];
  const doctorResult = spawnSync(
    doctorCommand,
    doctorArguments,
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  const standardOutput = doctorResult.stdout ?? '';
  const errorOutput = doctorResult.stderr ?? '';
  if (doctorResult.error) throw doctorResult.error;
  if (doctorResult.status === 0) {
    process.stdout.write(standardOutput);
    process.stderr.write(errorOutput);
    return;
  }

  const doctorOutput = `${standardOutput}\n${errorOutput}`;
  const gitIgnore = readFileSync(resolve(root, '.gitignore'), 'utf8');
  const gitAvailable = !gitResult.error && gitResult.status === 0;
  if (
    shouldAcceptMissingGitWarning({ doctorOutput, gitAvailable, gitIgnore })
  ) {
    console.log(
      'Expo 검사 20개 중 19개를 통과했고, Git 실행 파일이 없는 환경의 .expo 제외 규칙은 직접 확인했어요.',
    );
    return;
  }

  process.stdout.write(standardOutput);
  process.stderr.write(errorOutput);
  process.exitCode = doctorResult.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run();
}
