import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { getPublicApkPathSegments } from './apk-public-path.mjs';
import { readApkSigningCertificateSha256 } from './read-apk-metadata.mjs';
import {
  assertTrustedSigningCertificates,
  readReleasePolicy,
} from './release-policy.mjs';

export const DEFAULT_RECENT_VERSION_COUNT = 3;

const APK_FILE_PATTERN = /^AlarmPyo_[0-9]{8}\.apk$/iu;
const VERSION_DIRECTORY_PATTERN = /^v([1-9]\d*)$/iu;

function toPortablePath(segments) {
  return segments.join('/');
}

function isPathInside(parentPath, childPath) {
  const relativePath = relative(parentPath, childPath);
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

function addError(report, message) {
  report.errors.push(message);
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function scanDownloads(downloadsPath, report) {
  const files = [];
  const versionDirectories = [];
  const rootStats = await lstat(downloadsPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error('public/downloads가 실제 폴더가 아니라서 검사를 중단했어요.');
  }

  const rootEntries = await readdir(downloadsPath, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isSymbolicLink()) {
      addError(report, `심볼릭 링크는 APK 보관 폴더에 둘 수 없어요: ${entry.name}`);
      continue;
    }

    if (entry.isFile()) {
      if (!APK_FILE_PATTERN.test(entry.name)) {
        addError(report, `허용되지 않은 파일이 있어요: ${entry.name}`);
        continue;
      }
      files.push({
        relativePath: entry.name,
        absolutePath: resolve(downloadsPath, entry.name),
        versionDirectory: null,
      });
      continue;
    }

    if (!entry.isDirectory()) {
      addError(report, `허용되지 않은 항목이 있어요: ${entry.name}`);
      continue;
    }

    const versionMatch = VERSION_DIRECTORY_PATTERN.exec(entry.name);
    if (!versionMatch) {
      addError(report, `버전 폴더 이름이 올바르지 않아요: ${entry.name}`);
      continue;
    }

    const versionDirectory = {
      name: entry.name,
      versionCode: Number(versionMatch[1]),
    };
    versionDirectories.push(versionDirectory);
    const directoryPath = resolve(downloadsPath, entry.name);
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const child of entries) {
      const portablePath = `${entry.name}/${child.name}`;
      if (child.isSymbolicLink()) {
        addError(report, `심볼릭 링크는 APK 보관 폴더에 둘 수 없어요: ${portablePath}`);
        continue;
      }
      if (!child.isFile() || !APK_FILE_PATTERN.test(child.name)) {
        addError(report, `버전 폴더에 허용되지 않은 항목이 있어요: ${portablePath}`);
        continue;
      }
      files.push({
        relativePath: portablePath,
        absolutePath: resolve(directoryPath, child.name),
        versionDirectory: entry.name,
      });
    }
  }

  return { files, versionDirectories };
}

export async function auditPublicApkRetention({
  projectRoot,
  keepRecent = DEFAULT_RECENT_VERSION_COUNT,
  apply = false,
  readSigningCertificates = readApkSigningCertificateSha256,
}) {
  if (!Number.isInteger(keepRecent) || keepRecent < 1 || keepRecent > 20) {
    throw new Error('최근 버전 보존 개수는 1개부터 20개 사이여야 해요.');
  }

  const resolvedProjectRoot = resolve(projectRoot);
  const downloadsPath = resolve(resolvedProjectRoot, 'public', 'downloads');
  const manifestPath = resolve(
    resolvedProjectRoot,
    'public',
    'updates',
    'latest-android.json',
  );
  const previousManifestPath = resolve(
    resolvedProjectRoot,
    'public',
    'updates',
    'previous-android.json',
  );
  if (
    !isPathInside(resolvedProjectRoot, downloadsPath) ||
    !isPathInside(resolvedProjectRoot, manifestPath)
  ) {
    throw new Error('프로젝트 경계를 벗어난 배포 경로는 검사할 수 없어요.');
  }

  const [manifest, releasePolicy] = await Promise.all([
    readFile(manifestPath, 'utf8').then(JSON.parse),
    readReleasePolicy(resolvedProjectRoot),
  ]);
  let previousManifest = null;
  try {
    previousManifest = JSON.parse(await readFile(previousManifestPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const report = {
    ok: true,
    deletionPerformed: false,
    manifestReferencedFile: null,
    protectedVersionDirectories: [],
    protectedFiles: [],
    reviewFiles: [],
    deletedFiles: [],
    errors: [],
    warnings: [],
  };
  const { files, versionDirectories } = await scanDownloads(downloadsPath, report);

  const currentVersionCode = Number.isInteger(manifest.versionCode)
    ? manifest.versionCode
    : Number.POSITIVE_INFINITY;
  const recentDirectories = versionDirectories
    .filter((directory) => directory.versionCode <= currentVersionCode)
    .toSorted((left, right) => right.versionCode - left.versionCode)
    .slice(0, keepRecent);
  const protectedDirectories = new Set(
    recentDirectories.map((directory) => directory.name),
  );
  report.protectedVersionDirectories = recentDirectories.map(
    (directory) => directory.name,
  );

  let manifestRelativePath = null;
  const manifestSegments = getPublicApkPathSegments(
    manifest.apkUrl,
    releasePolicy.productionHostingUrl,
  );
  if (manifestSegments) {
    manifestRelativePath = toPortablePath(manifestSegments);
    const manifestApkPath = resolve(downloadsPath, ...manifestSegments);
    if (!isPathInside(downloadsPath, manifestApkPath)) {
      throw new Error('APK 배포 정보가 public/downloads 경계를 벗어났어요.');
    }
    report.manifestReferencedFile = manifestRelativePath;

    const manifestFile = files.find(
      (file) => file.relativePath === manifestRelativePath,
    );
    if (!manifestFile) {
      addError(
        report,
        `현재 APK 배포 정보가 참조하는 파일이 없어요: ${manifestRelativePath}`,
      );
    } else {
      const stats = await lstat(manifestFile.absolutePath);
      if (
        Number.isInteger(manifest.sizeBytes) &&
        stats.size !== manifest.sizeBytes
      ) {
        addError(
          report,
          `현재 APK 파일 크기가 배포 정보와 달라요: ${manifestRelativePath}`,
        );
      }
      if (
        typeof manifest.sha256 === 'string' &&
        /^[0-9a-f]{64}$/iu.test(manifest.sha256)
      ) {
        const actualHash = await hashFile(manifestFile.absolutePath);
        if (actualHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
          addError(
            report,
            `현재 APK의 SHA-256이 배포 정보와 달라요: ${manifestRelativePath}`,
          );
        }
      } else {
        addError(report, 'APK 배포 정보의 SHA-256 형식이 올바르지 않아요.');
      }
      try {
        assertTrustedSigningCertificates(
          await readSigningCertificates(manifestFile.absolutePath),
          releasePolicy,
        );
      } catch (error) {
        addError(
          report,
          error instanceof Error
            ? error.message
            : '현재 APK 운영 서명을 확인하지 못했어요.',
        );
      }

      if (manifestFile.versionDirectory) {
        protectedDirectories.add(manifestFile.versionDirectory);
      }
    }
  } else {
    report.warnings.push(
      '현재 APK 주소가 외부 보관소를 사용해 public/downloads의 참조 파일은 없어요.',
    );
  }

  const previousSegments = previousManifest
    ? getPublicApkPathSegments(
        previousManifest.apkUrl,
        releasePolicy.productionHostingUrl,
      )
    : null;
  if (previousSegments) {
    const previousRelativePath = toPortablePath(previousSegments);
    const previousFile = files.find(
      (file) => file.relativePath === previousRelativePath,
    );
    if (!previousFile) {
      addError(
        report,
        `직전 APK 배포 정보가 참조하는 파일이 없어요: ${previousRelativePath}`,
      );
    } else if (previousFile.versionDirectory) {
      protectedDirectories.add(previousFile.versionDirectory);
    }
  }

  const protectedFiles = [];
  const reviewFiles = [];
  for (const file of files) {
    const protectedByManifest = file.relativePath === manifestRelativePath;
    const protectedByRecentVersion =
      file.versionDirectory !== null &&
      protectedDirectories.has(file.versionDirectory);
    if (protectedByManifest || protectedByRecentVersion) {
      protectedFiles.push(file.relativePath);
    } else {
      reviewFiles.push(file.relativePath);
    }
  }
  report.protectedVersionDirectories = [...protectedDirectories].toSorted(
    (left, right) =>
      Number(right.slice(1)) - Number(left.slice(1)),
  );
  report.protectedFiles = protectedFiles.toSorted();
  report.reviewFiles = reviewFiles.toSorted();

  if (report.reviewFiles.length > 0) {
    report.warnings.push(
      `${report.reviewFiles.length}개 APK가 정리 대상이에요.`,
    );
  }
  report.ok = report.errors.length === 0;

  if (apply) {
    if (!report.ok) {
      throw new Error('APK 보존 검사가 실패해 정리를 실행하지 않았어요.');
    }
    for (const relativePath of report.reviewFiles) {
      const target = resolve(downloadsPath, ...relativePath.split('/'));
      if (!isPathInside(downloadsPath, target)) {
        throw new Error('APK 정리 대상이 public/downloads 경계를 벗어났어요.');
      }
      await rm(target);
      report.deletedFiles.push(relativePath);
    }
    for (const directory of versionDirectories) {
      if (protectedDirectories.has(directory.name)) continue;
      const directoryPath = resolve(downloadsPath, directory.name);
      if ((await readdir(directoryPath)).length === 0) {
        await rmdir(directoryPath);
      }
    }
    report.deletionPerformed = report.deletedFiles.length > 0;
  }
  return report;
}

function parseArguments(args) {
  let keepRecent = DEFAULT_RECENT_VERSION_COUNT;
  let json = false;
  let apply = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--keep-recent') {
      keepRecent = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (argument === '--help') {
      return { help: true, keepRecent, json, apply };
    }
    throw new Error(`지원하지 않는 옵션이에요: ${argument}`);
  }

  return { help: false, keepRecent, json, apply };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        '공개 APK의 보존 대상을 검사하고 오래된 APK를 안전하게 정리해요.',
        '--apply를 생략하면 파일을 삭제하지 않아요.',
        '',
        'node scripts/audit-public-apks.mjs',
        'node scripts/audit-public-apks.mjs --keep-recent 3 --json',
        'node scripts/audit-public-apks.mjs --keep-recent 3 --apply',
      ].join('\n'),
    );
    return;
  }

  const projectRoot = resolve(import.meta.dirname, '..');
  const report = await auditPublicApkRetention({
    projectRoot,
    keepRecent: options.keepRecent,
    apply: options.apply,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('APK 보존 정책 검사 결과예요.');
    console.log(
      `현재 배포 정보 참조: ${report.manifestReferencedFile ?? '외부 보관소'}`,
    );
    console.log(
      `보존 버전 폴더: ${report.protectedVersionDirectories.join(', ') || '없음'}`,
    );
    console.log(`보호 APK: ${report.protectedFiles.length}개`);
    console.log(`수동 검토 APK: ${report.reviewFiles.length}개`);
    for (const file of report.reviewFiles) console.log(`  - ${file}`);
    for (const warning of report.warnings) console.warn(`주의: ${warning}`);
    for (const error of report.errors) console.error(`오류: ${error}`);
    console.log(
      report.deletionPerformed
        ? `${report.deletedFiles.length}개 APK를 안전하게 정리했어요.`
        : '정리한 APK가 없어요.',
    );
  }

  if (!report.ok) process.exitCode = 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
