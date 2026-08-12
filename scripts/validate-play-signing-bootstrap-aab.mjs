import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseArgs,
  validatePlayAab,
} from './validate-play-aab.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const aabPath = args.get('--aab') || process.env.ALARMPYO_AAB_PATH;
  if (typeof aabPath !== 'string') {
    throw new Error('--aab 또는 ALARMPYO_AAB_PATH로 부트스트랩 AAB 파일을 지정해 주세요.');
  }
  const defaultProvenance = resolve(
    '.release',
    'play-signing-bootstrap',
    `${basename(aabPath)}.provenance.json`,
  );
  const artifact = await validatePlayAab({
    aabPath,
    provenanceOut:
      args.get('--no-write-provenance') === true
        ? null
        : String(args.get('--provenance-out') || defaultProvenance),
    easBuildEvidencePath:
      typeof args.get('--eas-build') === 'string'
        ? args.get('--eas-build')
        : process.env.ALARMPYO_EAS_BUILD_EVIDENCE ?? null,
    requireCleanSource: true,
    allowPlaySigningBootstrap: true,
  });
  console.log(
    `Play 서명 부트스트랩 AAB 검증을 완료했어요. ${artifact.packageName} ${artifact.versionName}(${artifact.versionCode}) · SHA-256 ${artifact.sha256}. 이 출처 기록은 제출에 사용할 수 없어요.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
