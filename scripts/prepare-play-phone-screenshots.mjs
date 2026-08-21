import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { writeJsonAtomic } from './atomic-json-file.mjs';
import {
  inspectPlayStoreImage,
  PLAY_STORE_ASSET_PATHS,
  readPhoneScreenshotManifest,
  validatePhoneScreenshotMetadata,
} from './play-store-assets.mjs';

const root = resolve(import.meta.dirname, '..');

export function parsePlayPhoneScreenshotArguments(argv) {
  let sourceDirectory = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--source-dir') {
      sourceDirectory = argv[index + 1] ?? null;
      index += 1;
    } else if (argument.startsWith('--source-dir=')) {
      sourceDirectory = argument.slice('--source-dir='.length);
    } else {
      throw new Error(`지원하지 않는 인자입니다: ${argument}`);
    }
  }
  if (!sourceDirectory) {
    throw new Error(
      '--source-dir로 V15 Play 설치본에서 다시 촬영한 WebP 4장의 폴더를 지정해야 합니다.',
    );
  }
  return { sourceDirectory: resolve(sourceDirectory) };
}

export async function convertWebpToOpaquePng({
  expectedHeight,
  expectedWidth,
  inputPath,
}) {
  const inputBytes = await readFile(inputPath);
  const image = sharp(inputBytes, {
    failOn: 'error',
    // Modern Android screenshots are often taller than Play's 9:16 target.
    // Keep a finite decode ceiling while allowing common QHD device captures.
    limitInputPixels: 3840 * 3840,
  });
  const metadata = await image.metadata();
  if (metadata.format !== 'webp') {
    throw new Error(`${inputPath}: 원본은 WebP여야 합니다.`);
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < expectedWidth ||
    metadata.height < expectedHeight
  ) {
    throw new Error(
      `${inputPath}: 최소 ${expectedWidth}×${expectedHeight} 실기기 원본이 필요합니다. 현재 ${metadata.width ?? '?'}×${metadata.height ?? '?'}이며 작은 원본을 확대하지 않습니다.`,
    );
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new Error(`${inputPath}: 움직이는 WebP는 스크린샷으로 사용할 수 없습니다.`);
  }

  const needsContain =
    metadata.width !== expectedWidth || metadata.height !== expectedHeight;
  const output = needsContain
    ? image.resize({
        background: '#101214',
        fit: 'contain',
        height: expectedHeight,
        kernel: 'lanczos3',
        width: expectedWidth,
        withoutEnlargement: true,
      })
    : image;

  return output
    .flatten({ background: '#101214' })
    .toColourspace('srgb')
    .png({
      adaptiveFiltering: false,
      compressionLevel: 9,
      force: true,
      palette: false,
      progressive: false,
    })
    .toBuffer();
}

export async function preparePlayPhoneScreenshots({ sourceDirectory }) {
  const manifest = await readPhoneScreenshotManifest(root);
  const targetDirectory = resolve(root, PLAY_STORE_ASSET_PATHS.phoneScreenshots);
  const stagingDirectory = await mkdtemp(
    resolve(tmpdir(), 'alarmpyo-play-screenshots-'),
  );
  const prepared = [];

  try {
    for (const screenshot of manifest.screenshots) {
      const inputPath = resolve(sourceDirectory, screenshot.sourceFile);
      const stagingPath = resolve(stagingDirectory, screenshot.outputFile);
      const bytes = await convertWebpToOpaquePng({
        expectedHeight: manifest.target.height,
        expectedWidth: manifest.target.width,
        inputPath,
      });
      await writeFile(stagingPath, bytes);
      const metadata = await inspectPlayStoreImage(stagingPath);
      validatePhoneScreenshotMetadata(
        metadata,
        `${screenshot.order}번 Play 휴대전화 스크린샷`,
      );
      if (
        metadata.width !== manifest.target.width ||
        metadata.height !== manifest.target.height
      ) {
        throw new Error(`${stagingPath}: manifest 목표 크기와 다릅니다.`);
      }
      prepared.push({
        outputFile: screenshot.outputFile,
        sha256: metadata.sha256,
        stagingPath,
      });
    }

    for (const screenshot of prepared) {
      await copyFile(
        screenshot.stagingPath,
        resolve(targetDirectory, screenshot.outputFile),
      );
    }
    await writeJsonAtomic(
      resolve(root, PLAY_STORE_ASSET_PATHS.phoneScreenshotManifest),
      { ...manifest, status: 'ready' },
    );
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true });
  }

  return prepared;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const options = parsePlayPhoneScreenshotArguments(process.argv.slice(2));
  preparePlayPhoneScreenshots(options)
    .then((prepared) => {
      for (const screenshot of prepared) {
        console.log(`${screenshot.outputFile}: SHA-256 ${screenshot.sha256}`);
      }
      console.log(
        'V15 실기기 스크린샷 4장을 불투명 RGB PNG로 준비했습니다. Play 등록 전 엄격 검사를 실행해야 합니다.',
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
