import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BRAND_ASSET_PATHS, buildBrandAssets } from './brand-assets.mjs';

export function parseBrandAssetArguments(argv) {
  if (argv.length !== 1 || !['--check', '--write'].includes(argv[0])) {
    throw new Error('사용법: node scripts/generate-brand-assets.mjs --check 또는 --write');
  }
  return { check: argv[0] === '--check' };
}

export async function runBrandAssetGeneration(argv = process.argv.slice(2)) {
  const { check } = parseBrandAssetArguments(argv);
  const root = resolve(import.meta.dirname, '..');
  const master = await readFile(resolve(root, BRAND_ASSET_PATHS.master));
  const wordmarkFont = await readFile(resolve(root, BRAND_ASSET_PATHS.wordmarkFont));
  const generated = buildBrandAssets(master, wordmarkFont);
  const mismatches = [];

  for (const [relativePath, bytes] of generated) {
    const outputPath = resolve(root, relativePath);
    if (check) {
      let current = null;
      try {
        current = await readFile(outputPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      if (!current?.equals(bytes)) mismatches.push(relativePath);
    } else {
      await writeFile(outputPath, bytes);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `브랜드 파생 자산이 마스터와 달라요. npm run assets:brand:generate를 실행하세요:\n- ${mismatches.join('\n- ')}`,
    );
  }
  console.log(
    check
      ? `브랜드 파생 자산 ${generated.size}개가 마스터와 일치해요.`
      : `브랜드 파생 자산 ${generated.size}개를 생성했어요.`,
  );
  return generated;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runBrandAssetGeneration().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
