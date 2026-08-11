import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { writeJsonAtomic } from './atomic-json-file.mjs';
import { createAndroidNativeFingerprint } from './release-artifact-provenance.mjs';
import {
  extractChannelArgument,
  readChannelBranch,
} from './ota-channel-policy.mjs';
import {
  appendOtaLedgerEntry,
  assertLedgerTracksCurrentRelease,
  readReleaseLedger,
  writeReleaseLedger,
} from './release-ledger.mjs';
import {
  readFileSnapshot,
  restoreFileSnapshot,
} from './release-file-transaction.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
await readReleasePolicy(root);
const easRunner = resolve(import.meta.dirname, 'run-eas-cli.mjs');
const outputPath = resolve(root, '.release', 'latest-ota.json');
const ledgerPath = resolve(root, 'docs', 'release-ledger.json');

function readSourceCommit() {
  const result = spawnSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'],
    { cwd: root, encoding: 'utf8' },
  );
  const commit = result.stdout?.trim().toLowerCase();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/u.test(commit ?? '')) {
    throw new Error('OTA 소스 커밋을 확인하지 못했어요.');
  }
  return commit;
}

function runEasJson(args, failureMessage) {
  const result = spawnSync(
    process.execPath,
    [easRunner, ...args, '--json', '--non-interactive'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(failureMessage);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${failureMessage} EAS JSON 결과를 읽지 못했어요.`);
  }
}

function normalizeUpdates(value, expectedRuntimeVersion) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('게시한 OTA 정보를 확인하지 못했어요.');
  }
  return value.map((update) => {
    if (
      typeof update?.id !== 'string' ||
      typeof update?.group !== 'string' ||
      typeof update?.platform !== 'string' ||
      update?.runtimeVersion !== expectedRuntimeVersion
    ) {
      throw new Error('게시한 OTA 정보 또는 런타임 버전이 올바르지 않아요.');
    }
    return {
      id: update.id,
      group: update.group,
      platform: update.platform,
      runtimeVersion: update.runtimeVersion,
    };
  });
}

function readChannel(channel) {
  return readChannelBranch(
    runEasJson(
      ['channel:view', channel],
      `${channel} OTA 채널을 확인하지 못했어요.`,
    ),
  );
}

function pointChannel(channel, branch) {
  runEasJson(
    ['channel:edit', channel, '--branch', branch],
    `${channel} OTA 채널을 ${branch} 브랜치로 연결하지 못했어요.`,
  );
}

const readJson = async (path) =>
  JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''));
const args = process.argv.slice(2);
if (args.length === 0) throw new Error('OTA 게시 옵션을 입력해 주세요.');
const { channel, publishArgs } = extractChannelArgument(args);

const sourceCommit = readSourceCommit();
const [app, publicManifest, nativeFingerprint, releaseLedger] =
  await Promise.all([
    readJson(resolve(root, 'app.json')),
    readJson(resolve(root, 'public', 'updates', 'latest-android.json')),
    createAndroidNativeFingerprint(root),
    readReleaseLedger(root),
  ]);
if (
  publicManifest.packageName !== app.expo.android.package ||
  publicManifest.versionName !== app.expo.version ||
  publicManifest.versionCode !== app.expo.android.versionCode ||
  publicManifest.nativeFingerprint !== nativeFingerprint ||
  publicManifest.provenanceArtifactSha256 !== publicManifest.sha256
) {
  throw new Error(
    '현재 소스의 네이티브 구성과 검증된 공개 APK가 달라 OTA를 게시할 수 없어요.',
  );
}
assertLedgerTracksCurrentRelease(releaseLedger, publicManifest);

const previousBranch = readChannel(channel);
const candidateBranch = `release-candidate-${channel}-${sourceCommit.slice(0, 12)}-${Date.now()}`;
const previousOutputSnapshot = await readFileSnapshot(outputPath);
const previousLedgerSnapshot = await readFileSnapshot(ledgerPath);
let candidatePublished = false;

try {
  const updates = normalizeUpdates(
    runEasJson(
      ['update', '--branch', candidateBranch, ...publishArgs],
      'OTA 후보 브랜치 게시를 완료하지 못했어요.',
    ),
    app.expo.version,
  );
  candidatePublished = true;
  if (readSourceCommit() !== sourceCommit) {
    throw new Error('OTA 후보 게시 중 소스 커밋이 바뀌었어요.');
  }

  const groups = [...new Set(updates.map((update) => update.group))];
  const promotedAt = new Date().toISOString();
  const record = {
    schemaVersion: 2,
    packageName: app.expo.android.package,
    versionName: app.expo.version,
    versionCode: app.expo.android.versionCode,
    channel,
    previousBranch,
    candidateBranch,
    sourceCommit,
    nativeFingerprint,
    baseApk: {
      sha256: publicManifest.sha256,
      sourceCommit: publicManifest.sourceCommit,
      easBuildId: publicManifest.easBuildId,
    },
    groups,
    updates,
    promotedAt,
  };
  await writeJsonAtomic(outputPath, record);
  await writeReleaseLedger(
    root,
    appendOtaLedgerEntry(releaseLedger, {
      channel,
      previousBranch,
      candidateBranch,
      versionName: app.expo.version,
      versionCode: app.expo.android.versionCode,
      sourceCommit,
      baseApkSha256: publicManifest.sha256,
      groups,
      promotedAt,
    }),
  );

  pointChannel(channel, candidateBranch);
  if (readChannel(channel) !== candidateBranch) {
    throw new Error('OTA 채널이 검증된 후보 브랜치를 가리키지 않아요.');
  }
  if (readSourceCommit() !== sourceCommit) {
    throw new Error('OTA 채널 승격 중 소스 커밋이 바뀌었어요.');
  }
  console.log(
    `${channel} 채널을 검증된 ${candidateBranch} 브랜치로 원자적으로 승격했어요: ${groups.join(', ')}`,
  );
} catch (error) {
  let rollbackError = null;
  if (candidatePublished) {
    try {
      pointChannel(channel, previousBranch);
      if (readChannel(channel) !== previousBranch) {
        throw new Error('직전 브랜치 연결을 다시 확인하지 못했어요.');
      }
    } catch (channelError) {
      rollbackError = channelError;
    }
  }
  await restoreFileSnapshot(outputPath, previousOutputSnapshot);
  await restoreFileSnapshot(ledgerPath, previousLedgerSnapshot);
  if (rollbackError) {
    throw new AggregateError(
      [error, rollbackError],
      `${channel} OTA 채널 자동 롤백을 확인하지 못했어요. EAS 채널을 ${previousBranch} 브랜치로 수동 복구해 주세요.`,
    );
  }
  throw new Error(
    'OTA 후보를 운영 채널에 남기지 않고 이전 브랜치로 복구했어요.',
    {
      cause: error,
    },
  );
}
