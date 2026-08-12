import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { validatePlayStoreAssets } from './play-store-assets.mjs';

export function parsePlayStoreAssetArguments(argv) {
  const supported = new Set(['--allow-missing-screenshots']);
  const unknown = argv.filter((argument) => !supported.has(argument));
  if (unknown.length > 0) {
    throw new Error(`지원하지 않는 인자예요: ${unknown.join(', ')}`);
  }
  return {
    requirePhoneScreenshots: !argv.includes('--allow-missing-screenshots'),
  };
}

export async function runPlayStoreAssetValidation(argv = process.argv.slice(2)) {
  const options = parsePlayStoreAssetArguments(argv);
  const result = await validatePlayStoreAssets({
    ...options,
    root: resolve(import.meta.dirname, '..'),
  });

  for (const warning of result.warnings) console.warn(`주의: ${warning}`);
  if (result.errors.length > 0) {
    throw new Error(result.errors.map((error) => `- ${error}`).join('\n'));
  }

  console.log(
    `Google Play 등록 자산을 확인했어요. 아이콘 1개, 대표 그래픽 1개, 휴대전화 스크린샷 ${result.assets.phoneScreenshots.length}개`,
  );
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runPlayStoreAssetValidation().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
