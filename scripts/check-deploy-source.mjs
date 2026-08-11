import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getPublicApkPathSegments } from './apk-public-path.mjs';
import { assertDeploySourceState } from './deploy-source-policy.mjs';
import { findUnpromotedPublicVersionCodes } from './release-public-staging.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const releaseTransaction = process.env.ALARMPYO_DEPLOY_VERIFY_RELEASE === '1';
const releasePolicy = await readReleasePolicy(root);

function runGit(args) {
  const result = spawnSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('웹 배포 전 Git 상태를 확인하지 못했어요.');
  }
  return result.stdout;
}

const tracked = runGit([
  'diff',
  'HEAD',
  '--name-only',
  '--diff-filter=ACDMRTUXB',
])
  .split(/\r?\n/u)
  .filter(Boolean);
const untracked = runGit(['ls-files', '--others', '--exclude-standard'])
  .split(/\r?\n/u)
  .filter(Boolean);
const changes = [...new Set([...tracked, ...untracked])];
const manifest = await readFile(
  resolve(root, 'public/updates/latest-android.json'),
  'utf8',
).then(JSON.parse);
const unpromotedVersionCodes = await findUnpromotedPublicVersionCodes({
  projectRoot: root,
  currentVersionCode: manifest.versionCode,
});
if (unpromotedVersionCodes.length > 0) {
  throw new Error(
    `운영 manifest보다 새 버전의 미승격 APK가 공개 경로에 있어 웹 배포를 중단했어요: ${unpromotedVersionCodes.map((value) => `v${value}`).join(', ')}`,
  );
}

if (releaseTransaction) {
  const [app, commit] = await Promise.all([
    readFile(resolve(root, 'app.json'), 'utf8').then(JSON.parse),
    Promise.resolve(runGit(['rev-parse', 'HEAD']).trim()),
  ]);
  const publicApkPathSegments = getPublicApkPathSegments(
    manifest.apkUrl,
    releasePolicy.productionHostingUrl,
  );
  const expectedPublicApkPath = publicApkPathSegments
    ? `public/downloads/${publicApkPathSegments.join('/')}`
    : null;
  const allowedRemovalPrefixes = (
    process.env.ALARMPYO_RELEASE_ALLOWED_REMOVAL_PREFIXES ?? ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedRemovalPrefixes.length > 0) {
    throw new Error(
      'AlarmPyo 새 계보에서는 이전 앱의 공개 APK 경로를 자동 정리하지 않아요.',
    );
  }
  assertDeploySourceState({
    allowedReleasePaths: [
      'docs/release-ledger.json',
      ...(expectedPublicApkPath ? [expectedPublicApkPath] : []),
    ],
    allowedReleasePrefixes: allowedRemovalPrefixes,
    changes,
    releaseTransaction,
  });
  if (
    manifest.sourceCommit !== commit ||
    manifest.versionName !== app.expo?.version ||
    manifest.versionCode !== app.expo?.android?.versionCode
  ) {
    throw new Error(
      'APK 승격용 배포 정보가 현재 커밋과 앱 버전에 연결되지 않았어요.',
    );
  }
} else {
  assertDeploySourceState({ changes, releaseTransaction });
}

console.log(
  releaseTransaction
    ? 'APK 승격 중 생성된 배포 정보만 변경된 상태예요.'
    : '웹 배포 소스가 깨끗한 커밋 상태예요.',
);
