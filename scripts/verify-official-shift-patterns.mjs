import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  OFFICIAL_PATTERN_IDS,
  parseAndVerifySignedDocument,
  parseJsonStrict,
} from './shift-pattern-node-contract.mjs';
import { validateOfficialShiftPatternSources } from './validate-official-shift-pattern-sources.mjs';

const root = resolve(import.meta.dirname, '..');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

export async function verifyOfficialShiftPatterns({
  officialRoot = resolve(root, 'official-patterns'),
  directory,
} = {}) {
  if (!directory) throw new Error('검증할 공식 패턴 디렉터리를 지정해야 합니다.');
  const { keyring, manifest } = await validateOfficialShiftPatternSources({ officialRoot });
  if (!keyring.keys.some((key) => key.id === manifest.keyId)) {
    throw new Error('공식 패턴 manifest의 실제 공개키가 keyring에 등록되지 않았습니다.');
  }
  const inputRoot = resolve(directory);
  const fileNames = await readdir(inputRoot);
  const expected = new Set(OFFICIAL_PATTERN_IDS.map((id) => `${id}.json`));
  for (const fileName of expected) {
    if (!fileNames.includes(fileName)) {
      throw new Error(`공식 패턴 파일이 없습니다: ${fileName}`);
    }
  }
  const documents = [];
  for (const id of OFFICIAL_PATTERN_IDS) {
    const contents = await readFile(resolve(inputRoot, `${id}.json`), 'utf8');
    const value = parseJsonStrict(contents, `${id} 공식 패턴 파일`);
    const verified = parseAndVerifySignedDocument(value, manifest, keyring);
    if (verified.id !== id) throw new Error(`공식 패턴 파일 ID가 다릅니다: ${id}`);
    documents.push(verified);
  }
  return documents;
}

async function main() {
  const directory = argumentValue('--directory');
  const documents = await verifyOfficialShiftPatterns({ directory });
  console.log(`공식 근무 패턴 서명 파일 ${documents.length}개를 검증했습니다.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : '공식 패턴 검증에 실패했습니다.');
    process.exitCode = 1;
  });
}
