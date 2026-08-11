import { lstat, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const STATIC_OUTPUT_DIRECTORY = 'dist';

function isPathInside(parentPath, childPath) {
  const relativePath = relative(parentPath, childPath);
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

export function resolveStaticOutputDirectory(
  projectRoot,
  requestedOutput = STATIC_OUTPUT_DIRECTORY,
) {
  if (typeof projectRoot !== 'string' || projectRoot.trim().length === 0) {
    throw new Error('프로젝트 경로가 비어 있어 정적 출력 폴더를 정리할 수 없어요.');
  }
  if (typeof requestedOutput !== 'string' || requestedOutput.trim().length === 0) {
    throw new Error('정적 출력 폴더 경로가 비어 있어요.');
  }

  const resolvedProjectRoot = resolve(projectRoot);
  const allowedOutput = resolve(resolvedProjectRoot, STATIC_OUTPUT_DIRECTORY);
  const requestedPath = resolve(resolvedProjectRoot, requestedOutput);

  if (
    requestedPath !== allowedOutput ||
    !isPathInside(resolvedProjectRoot, requestedPath)
  ) {
    throw new Error(
      `정적 출력 폴더는 프로젝트 안의 ${STATIC_OUTPUT_DIRECTORY}만 사용할 수 있어요.`,
    );
  }

  return requestedPath;
}

async function inspectEntry(entryPath, displayPath) {
  const stats = await lstat(entryPath);
  if (stats.isSymbolicLink()) {
    throw new Error(
      `심볼릭 링크가 포함된 출력 폴더는 안전하게 정리할 수 없어요: ${displayPath}`,
    );
  }
  if (!stats.isDirectory()) {
    return { files: 1, directories: 0, bytes: stats.size };
  }

  let files = 0;
  let directories = 1;
  let bytes = 0;
  const entries = await readdir(entryPath);
  for (const entry of entries) {
    const result = await inspectEntry(
      resolve(entryPath, entry),
      `${displayPath}/${entry}`,
    );
    files += result.files;
    directories += result.directories;
    bytes += result.bytes;
  }
  return { files, directories, bytes };
}

export async function inspectStaticOutput({
  projectRoot,
  output = STATIC_OUTPUT_DIRECTORY,
}) {
  const outputPath = resolveStaticOutputDirectory(projectRoot, output);
  try {
    const stats = await lstat(outputPath);
    if (stats.isSymbolicLink()) {
      throw new Error('정적 출력 폴더 자체가 심볼릭 링크라서 정리를 중단했어요.');
    }
    if (!stats.isDirectory()) {
      throw new Error('정적 출력 경로가 폴더가 아니라서 정리를 중단했어요.');
    }
    const summary = await inspectEntry(outputPath, STATIC_OUTPUT_DIRECTORY);
    return {
      exists: true,
      outputPath,
      files: summary.files,
      directories: Math.max(0, summary.directories - 1),
      bytes: summary.bytes,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        exists: false,
        outputPath,
        files: 0,
        directories: 0,
        bytes: 0,
      };
    }
    throw error;
  }
}

export async function prepareStaticExport({
  projectRoot,
  output = STATIC_OUTPUT_DIRECTORY,
  apply = false,
}) {
  const inspection = await inspectStaticOutput({ projectRoot, output });
  if (!apply || !inspection.exists) {
    return { ...inspection, applied: false };
  }

  await rm(inspection.outputPath, {
    recursive: true,
    force: false,
    maxRetries: 3,
    retryDelay: 100,
  });

  return { ...inspection, applied: true };
}

function parseArguments(args) {
  let apply = false;
  let output = STATIC_OUTPUT_DIRECTORY;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (argument === '--output') {
      output = args[index + 1];
      if (!output) {
        throw new Error('--output 다음에 폴더 경로를 입력해 주세요.');
      }
      index += 1;
      continue;
    }
    if (argument === '--help') {
      return { help: true, apply, output };
    }
    throw new Error(`지원하지 않는 옵션이에요: ${argument}`);
  }

  return { help: false, apply, output };
}

function formatBytes(value) {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        '정적 내보내기 전에 이전 dist 산출물을 안전하게 확인하거나 정리해요.',
        '',
        '확인만 하기: node scripts/prepare-static-export.mjs',
        '실제로 정리하기: node scripts/prepare-static-export.mjs --apply',
      ].join('\n'),
    );
    return;
  }

  const projectRoot = resolve(import.meta.dirname, '..');
  const result = await prepareStaticExport({
    projectRoot,
    output: options.output,
    apply: options.apply,
  });

  if (!result.exists) {
    console.log('정리할 dist 산출물이 없어요.');
    return;
  }

  const summary = `${result.files}개 파일 · ${result.directories}개 폴더 · ${formatBytes(result.bytes)}`;
  if (result.applied) {
    console.log(`dist 산출물을 정리했어요: ${summary}`);
    return;
  }

  console.log(`정리 예정인 dist 산출물이에요: ${summary}`);
  console.log('현재는 확인만 했어요. 실제 정리는 --apply를 붙여 실행해 주세요.');
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
