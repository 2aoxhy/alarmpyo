import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { writeJsonAtomic } from './atomic-json-file.mjs';
import { assertPlayReleaseEvidence } from './play-release-evidence.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const [name, inlineValue] = argument.split('=', 2);
    const nextValue = argv[index + 1];
    const value = inlineValue ?? nextValue;
    if (inlineValue === undefined && value && !value.startsWith('--')) index += 1;
    values.set(name, inlineValue ?? (value?.startsWith('--') ? true : value ?? true));
  }
  return values;
}

function isInsideProject(path) {
  const result = relative(root, path);
  return result.length > 0 && result !== '..' && !result.startsWith(`..${sep}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readJson(path, missingMessage) {
  try {
    return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(missingMessage);
    throw error;
  }
}

async function readLinkedEvidence(pointer, expectedDirectory, label) {
  if (
    typeof pointer?.path !== 'string' ||
    !new RegExp(
      `^\\.release/play/${expectedDirectory}/[a-z0-9._-]+\\.json$`,
      'iu',
    ).test(pointer.path) ||
    !/^[0-9a-f]{64}$/iu.test(pointer?.sha256 ?? '')
  ) {
    throw new Error(`${label} 파일 경로와 SHA-256이 올바르지 않아요.`);
  }
  const absolutePath = resolve(root, ...pointer.path.split('/'));
  if (!isInsideProject(absolutePath)) {
    throw new Error(`${label} 파일이 프로젝트 경계를 벗어났어요.`);
  }
  const stats = await lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label}는 실제 JSON 파일이어야 해요.`);
  }
  const bytes = await readFile(absolutePath);
  if (sha256(bytes) !== pointer.sha256.toLowerCase()) {
    throw new Error(`${label} 파일 SHA-256이 기록과 달라요.`);
  }
  return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
}

export async function validatePlayReleaseEvidence({
  evidencePath,
  provenancePath,
  outputPath,
  now,
}) {
  const [releaseEvidence, artifact, releasePolicy] = await Promise.all([
    readJson(resolve(root, evidencePath), 'Play 릴리스 증거 파일이 없어요.'),
    readJson(resolve(root, provenancePath), '검증된 Play AAB 출처 기록이 없어요.'),
    readReleasePolicy(root),
  ]);
  const [physicalDevice, pageSize16KbDevice, preLaunchReport] = await Promise.all([
    readLinkedEvidence(
      releaseEvidence.physicalDeviceEvidence,
      'device-evidence',
      'Play Samsung 실기기 증거',
    ),
    readLinkedEvidence(
      releaseEvidence.pageSize16KbEvidence,
      'device-evidence',
      'Play 16KB 기기 증거',
    ),
    readLinkedEvidence(
      releaseEvidence.preLaunchReportEvidence,
      'prelaunch-evidence',
      'Play 사전 출시 보고서 증거',
    ),
  ]);
  const binding = assertPlayReleaseEvidence(
    releaseEvidence,
    artifact,
    releasePolicy,
    { physicalDevice, pageSize16KbDevice, preLaunchReport },
    { now },
  );
  const verified = {
    schemaVersion: 1,
    ...binding,
    physicalDeviceEvidenceSha256:
      releaseEvidence.physicalDeviceEvidence.sha256.toLowerCase(),
    pageSize16KbEvidenceSha256:
      releaseEvidence.pageSize16KbEvidence.sha256.toLowerCase(),
    preLaunchReportEvidenceSha256:
      releaseEvidence.preLaunchReportEvidence.sha256.toLowerCase(),
    verifiedAt: new Date(now ?? Date.now()).toISOString(),
  };
  if (outputPath) await writeJsonAtomic(resolve(root, outputPath), verified);
  return verified;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidencePath = String(
    args.get('--evidence') ??
      process.env.ALARMPYO_PLAY_RELEASE_EVIDENCE ??
      '.release/play/release-evidence.json',
  );
  const provenancePath =
    args.get('--provenance') ?? process.env.ALARMPYO_PLAY_AAB_PROVENANCE;
  if (typeof provenancePath !== 'string') {
    throw new Error('--provenance 또는 ALARMPYO_PLAY_AAB_PROVENANCE로 AAB 출처 기록을 지정해 주세요.');
  }
  const outputPath = String(
    args.get('--output') ?? '.release/play/verified-release-evidence.json',
  );
  const verified = await validatePlayReleaseEvidence({
    evidencePath,
    provenancePath,
    outputPath,
  });
  console.log(
    `Play 출고 증거를 확인했어요. ${verified.versionCode} · AAB ${verified.aabSha256.slice(0, 12)}… · 인증서 ${verified.appSigningCertificateSha256.slice(0, 12)}…`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
