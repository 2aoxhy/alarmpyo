import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gitArguments = [
  '-c',
  `safe.directory=${root.replaceAll('\\', '/')}`,
  'status',
  '--porcelain=v1',
  '--untracked-files=all',
];
const result = spawnSync('git', gitArguments, {
  cwd: root,
  encoding: 'utf8',
});

if (result.error || result.status !== 0) {
  console.error('릴리스 소스의 Git 상태를 확인하지 못했어요.');
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(1);
}

const changes = (result.stdout ?? '')
  .split(/\r?\n/u)
  .map((line) => line.trimEnd())
  .filter(Boolean);
if (changes.length > 0) {
  console.error('커밋하지 않은 변경이 있어 릴리스를 시작할 수 없어요.');
  for (const change of changes.slice(0, 20)) console.error(`- ${change}`);
  if (changes.length > 20) console.error(`- 그 밖의 변경 ${changes.length - 20}개`);
  process.exit(1);
}

console.log('릴리스 소스가 커밋된 상태예요.');
