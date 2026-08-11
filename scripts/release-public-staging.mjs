import { existsSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { hashFileSha256 } from './release-policy.mjs';

export function getPromotionCleanupVersionCodes() {
  // AlarmPyo는 빈 릴리스 계보에서 시작하므로 이전 앱의 공개 후보를 승격
  // 트랜잭션에 섞거나 자동 정리하지 않아요.
  return [];
}

export async function findUnpromotedPublicVersionCodes({
  projectRoot,
  currentVersionCode,
}) {
  const entries = await readdir(resolve(projectRoot, 'public', 'downloads'), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory() && /^v[1-9]\d*$/u.test(entry.name))
    .map((entry) => Number(entry.name.slice(1)))
    .filter((versionCode) => versionCode > currentVersionCode)
    .toSorted((left, right) => left - right);
}

export async function publishPrivateApkCandidate({
  sourcePath,
  targetPath,
  expectedSha256,
  expectedSizeBytes,
}) {
  if (existsSync(targetPath)) {
    throw new Error(
      '검증 전에 공개 경로에 같은 버전 APK가 이미 있어 승격을 중단했어요.',
    );
  }
  const sourceStats = await stat(sourcePath);
  if (!sourceStats.isFile() || sourceStats.size !== expectedSizeBytes) {
    throw new Error('비공개 APK 후보의 파일 크기가 staged manifest와 달라요.');
  }
  const sourceHash = await hashFileSha256(sourcePath);
  if (sourceHash !== expectedSha256) {
    throw new Error('비공개 APK 후보의 SHA-256이 staged manifest와 달라요.');
  }
  await mkdir(dirname(targetPath), { recursive: true });
  const pendingPath = `${targetPath}.${process.pid}.pending`;
  await rm(pendingPath, { force: true });
  try {
    await copyFile(sourcePath, pendingPath);
    if ((await hashFileSha256(pendingPath)) !== expectedSha256) {
      throw new Error('공개 경로로 복사한 APK 후보의 SHA-256이 달라요.');
    }
    await rename(pendingPath, targetPath);
  } finally {
    await rm(pendingPath, { force: true });
  }
}

export async function quarantinePublicCandidateDirectories({
  projectRoot,
  versionCodes,
}) {
  const quarantineRoot = resolve(
    projectRoot,
    '.release',
    'public-candidate-quarantine',
    `${Date.now()}-${process.pid}`,
  );
  const moves = [];
  for (const versionCode of versionCodes) {
    const originalPath = resolve(
      projectRoot,
      'public',
      'downloads',
      `v${versionCode}`,
    );
    if (!existsSync(originalPath)) continue;
    const stats = await lstat(originalPath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`v${versionCode} 공개 후보 경로가 실제 폴더가 아니에요.`);
    }
    const quarantinedPath = resolve(quarantineRoot, `v${versionCode}`);
    await mkdir(dirname(quarantinedPath), { recursive: true });
    await rename(originalPath, quarantinedPath);
    moves.push({ originalPath, quarantinedPath, versionCode });
  }
  return moves;
}

export async function restoreQuarantinedCandidates(moves) {
  for (const move of [...moves].reverse()) {
    if (!existsSync(move.quarantinedPath)) continue;
    if (existsSync(move.originalPath)) {
      throw new Error(
        `v${move.versionCode} 공개 후보를 복구할 위치가 이미 사용 중이에요.`,
      );
    }
    await mkdir(dirname(move.originalPath), { recursive: true });
    await rename(move.quarantinedPath, move.originalPath);
  }
}

export async function discardQuarantinedCandidates(moves) {
  await Promise.all(
    moves.map((move) =>
      rm(move.quarantinedPath, { recursive: true, force: true }),
    ),
  );
}
