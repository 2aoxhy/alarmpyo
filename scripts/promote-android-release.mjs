import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { getPublicApkPathSegments } from './apk-public-path.mjs';
import {
  assertReleaseVersionIsNewer,
  readReleasePolicy,
} from './release-policy.mjs';
import {
  appendApkLedgerEntry,
  assertDurableApkMirrors,
  assertLedgerTracksCurrentRelease,
  createApkLedgerEntry,
  readReleaseLedger,
  writeReleaseLedger,
} from './release-ledger.mjs';
import {
  readFileSnapshot,
  restoreFileSnapshot,
  rollbackPromotionFiles,
} from './release-file-transaction.mjs';
import {
  discardQuarantinedCandidates,
  getPromotionCleanupVersionCodes,
  publishPrivateApkCandidate,
  quarantinePublicCandidateDirectories,
  restoreQuarantinedCandidates,
} from './release-public-staging.mjs';

const root = resolve(import.meta.dirname, '..');
const stagedManifest = resolve(root, '.release', 'latest-android.json');
const publicManifest = resolve(
  root,
  'public',
  'updates',
  'latest-android.json',
);
const previousPublicManifestPath = resolve(
  root,
  'public',
  'updates',
  'previous-android.json',
);
const verifiedDeviceMatrixPath = resolve(
  root,
  '.release',
  'verified-device-matrix.json',
);
const releaseLedgerPath = resolve(root, 'docs', 'release-ledger.json');
const releasePolicy = await readReleasePolicy(root);

function runNpm(script, forwardedArgs = []) {
  const bundledNpmCli = resolve(
    dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  const useBundledNpm =
    process.platform === 'win32' && existsSync(bundledNpmCli);
  const result = spawnSync(
    useBundledNpm ? process.execPath : 'npm',
    [
      ...(useBundledNpm ? [bundledNpmCli] : []),
      'run',
      script,
      ...(forwardedArgs.length > 0 ? ['--', ...forwardedArgs] : []),
    ],
    { cwd: root, env: process.env, stdio: 'inherit', shell: false },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${script} 단계가 완료되지 않았어요.`);
}

function readCurrentCommit() {
  const result = spawnSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'],
    { cwd: root, encoding: 'utf8' },
  );
  const commit = result.stdout?.trim().toLowerCase();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/u.test(commit ?? '')) {
    throw new Error('현재 릴리스 소스 커밋을 확인하지 못했어요.');
  }
  return commit;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

async function validateStagedManifest(currentManifestSnapshot) {
  const staged = JSON.parse(await readFile(stagedManifest, 'utf8'));
  if (!Number.isInteger(staged.versionCode) || staged.versionCode < 1) {
    throw new Error('준비한 APK 배포 정보의 버전을 확인할 수 없어요.');
  }
  const current = currentManifestSnapshot
    ? JSON.parse(currentManifestSnapshot.toString('utf8'))
    : null;
  assertReleaseVersionIsNewer(staged.versionCode, current);
  if (staged.sourceCommit !== readCurrentCommit()) {
    throw new Error('APK 배포 정보의 소스 커밋과 현재 저장소 커밋이 달라요.');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      staged.easBuildId ?? '',
    )
  ) {
    throw new Error('추적 가능한 EAS 빌드 ID가 APK 배포 정보에 필요해요.');
  }
  if (!/^[0-9a-f]{64}$/iu.test(staged.nativeFingerprint ?? '')) {
    throw new Error('APK 배포 정보에 Android 네이티브 호환 지문이 필요해요.');
  }
  if (
    !isHttpsUrl(staged.provenanceArtifactUrl) ||
    staged.provenanceArtifactSha256 !== staged.sha256
  ) {
    throw new Error('검증된 EAS 원본 APK 주소와 SHA-256이 필요해요.');
  }
  const buildFinishedAt = Date.parse(staged.easBuildFinishedAt ?? '');
  const provenanceVerifiedAt = Date.parse(staged.provenanceVerifiedAt ?? '');
  if (
    !Number.isFinite(buildFinishedAt) ||
    !Number.isFinite(provenanceVerifiedAt) ||
    provenanceVerifiedAt < buildFinishedAt
  ) {
    throw new Error('EAS 빌드 완료 뒤 원본 APK를 검증한 시각이 필요해요.');
  }
  assertDurableApkMirrors(staged);
  return staged;
}

async function replacePublicManifest() {
  await mkdir(dirname(publicManifest), { recursive: true });
  const pending = `${publicManifest}.pending`;
  await rm(pending, { force: true });
  await copyFile(stagedManifest, pending);
  await rm(publicManifest, { force: true });
  await rename(pending, publicManifest);
}

function resolvePublicApkTarget(urlValue) {
  const segments = getPublicApkPathSegments(
    new URL(urlValue),
    releasePolicy.productionHostingUrl,
  );
  return segments ? resolve(root, 'public', 'downloads', ...segments) : null;
}

if (!process.env.ALARMPYO_APK_PATH || !process.env.ALARMPYO_APK_URL) {
  console.error(
    'ALARMPYO_APK_PATH와 ALARMPYO_APK_URL을 설정한 뒤 APK 승격을 실행해 주세요.',
  );
  process.exit(1);
}

console.log('1/6 · 커밋한 릴리스 소스인지 확인해요.');
runNpm('release:source');

const previousPublicManifest = await readFileSnapshot(publicManifest);
const previousRollbackManifest = await readFileSnapshot(
  previousPublicManifestPath,
);
const previousLedgerSnapshot = await readFileSnapshot(releaseLedgerPath);
if (previousLedgerSnapshot === null) {
  throw new Error('AlarmPyo 릴리스 원장이 필요해요.');
}
const releaseLedger = await readReleaseLedger(root);
const currentManifest = previousPublicManifest
  ? JSON.parse(previousPublicManifest.toString('utf8'))
  : null;
if (currentManifest) {
  assertLedgerTracksCurrentRelease(releaseLedger, currentManifest);
} else if (releaseLedger.apkReleases.length > 0) {
  throw new Error(
    '공개 APK 정보는 없지만 릴리스 원장에는 기록이 있어 첫 승격을 시작할 수 없어요.',
  );
}
const publicApkTarget = resolvePublicApkTarget(process.env.ALARMPYO_APK_URL);
if (!publicApkTarget) {
  throw new Error(
    'APK 운영 주소는 검증 뒤 공개할 public/downloads 불변 경로여야 해요.',
  );
}
const privateApkCandidate = resolve(root, process.env.ALARMPYO_APK_PATH);
const publicApkExistedBefore = publicApkTarget
  ? existsSync(publicApkTarget)
  : false;
let quarantinedCandidates = [];
let promoted;

try {
  console.log(
    '2/6 · 공개 경로를 바꾸지 않고 EAS APK 후보를 비공개로 준비해요.',
  );
  runNpm('release:manifest');
  promoted = await validateStagedManifest(previousPublicManifest);

  console.log(
    '3/6 · Samsung 실기기와 Android 12~16 에뮬레이터 증거를 대조해요.',
  );
  runNpm('release:verify:staged');
  runNpm('release:verify:device-matrix');
  const matrixBinding = JSON.parse(
    await readFile(verifiedDeviceMatrixPath, 'utf8'),
  );
  for (const [field, expected] of [
    ['apkSha256', promoted.sha256],
    ['sourceCommit', promoted.sourceCommit],
    ['easBuildId', promoted.easBuildId],
    ['nativeFingerprint', promoted.nativeFingerprint],
  ]) {
    if (matrixBinding[field] !== expected) {
      throw new Error(`검증된 기기 매트릭스의 ${field}이 APK 후보와 달라요.`);
    }
  }

  console.log(
    '4/6 · 미승격 공개 후보를 격리하고 검증된 APK만 공개 경로에 복사해요.',
  );
  const cleanupVersionCodes = getPromotionCleanupVersionCodes({
    currentVersionCode: currentManifest?.versionCode ?? 0,
    targetVersionCode: promoted.versionCode,
    targetVersionName: promoted.versionName,
  });
  quarantinedCandidates = await quarantinePublicCandidateDirectories({
    projectRoot: root,
    versionCodes: cleanupVersionCodes,
  });
  process.env.ALARMPYO_RELEASE_ALLOWED_REMOVAL_PREFIXES = cleanupVersionCodes
    .map((versionCode) => `public/downloads/v${versionCode}/`)
    .join(',');
  await publishPrivateApkCandidate({
    sourcePath: privateApkCandidate,
    targetPath: publicApkTarget,
    expectedSha256: promoted.sha256,
    expectedSizeBytes: promoted.sizeBytes,
  });
  await restoreFileSnapshot(previousPublicManifestPath, previousPublicManifest);
  await replacePublicManifest();
  await writeReleaseLedger(
    root,
    appendApkLedgerEntry(
      releaseLedger,
      createApkLedgerEntry(promoted, matrixBinding, new Date()),
    ),
  );

  console.log('5/6 · 현재·직전 APK와 릴리스 원장의 보존 정책을 확인해요.');
  runNpm('audit:artifacts');

  console.log('6/6 · 새 웹 배포를 검증한 뒤 운영 주소에 연결해요.');
  process.env.ALARMPYO_DEPLOY_VERIFY_RELEASE = '1';
  runNpm('deploy:web');
} catch (promotionError) {
  console.error('새 배포 확인에 실패해 공개 배포 정보를 이전 상태로 되돌려요.');
  await rollbackPromotionFiles({
    previousManifestPath: previousPublicManifestPath,
    previousManifestSnapshot: previousRollbackManifest,
    publicApkExistedBefore,
    publicApkTarget,
    publicManifestPath: publicManifest,
    publicManifestSnapshot: previousPublicManifest,
  });
  await restoreFileSnapshot(releaseLedgerPath, previousLedgerSnapshot);
  await restoreQuarantinedCandidates(quarantinedCandidates);
  throw new Error('새 배포를 공개하지 않고 이전 배포 정보로 복구했어요.', {
    cause: promotionError,
  });
}

await discardQuarantinedCandidates(quarantinedCandidates);

try {
  runNpm('audit:artifacts', [
    '--keep-recent',
    String(releasePolicy.keepPublicApkVersions),
    '--apply',
  ]);
} catch {
  console.warn(
    '배포는 완료했지만 오래된 APK 정리는 다음 검사에서 다시 시도해요.',
  );
}

console.log(
  `Android ${promoted.versionName}(${promoted.versionCode}) 배포를 완료했어요.`,
);
