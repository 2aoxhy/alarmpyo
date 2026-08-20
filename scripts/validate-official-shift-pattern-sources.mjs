import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseJsonStrict,
  parseManifest,
  parsePublicKeyring,
  parseUnsignedSource,
} from './shift-pattern-node-contract.mjs';

const root = resolve(import.meta.dirname, '..');

async function readJson(path, label) {
  return parseJsonStrict(await readFile(path, 'utf8'), label);
}

export async function validateOfficialShiftPatternSources(options = {}) {
  const officialRoot = resolve(options.officialRoot ?? resolve(root, 'official-patterns'));
  const manifest = parseManifest(
    await readJson(resolve(officialRoot, 'manifest.json'), '공식 패턴 manifest'),
  );
  const keyring = parsePublicKeyring(
    await readJson(resolve(officialRoot, 'public-keyring.json'), '공식 패턴 공개키 keyring'),
  );
  const signingKeys = keyring.keys.filter((key) => key.id === manifest.keyId);
  if (options.requireSigningKey !== false && signingKeys.length !== 1) {
    throw new Error(
      '공식 패턴 manifest의 실제 공개키가 keyring에 정확히 한 개 등록되어야 합니다.',
    );
  }
  const sources = [];
  for (const definition of manifest.patterns) {
    const source = parseUnsignedSource(
      await readJson(
        resolve(officialRoot, 'sources', `${definition.id}.source.json`),
        `${definition.id} unsigned source`,
      ),
      manifest,
    );
    sources.push(source);
  }
  return { keyring, manifest, sources };
}

async function main() {
  const { keyring, sources } = await validateOfficialShiftPatternSources();
  console.log(
    `공식 근무 패턴 unsigned source ${sources.length}개와 공개키 ${keyring.keys.length}개 계약을 확인했습니다.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : '공식 패턴 source 검증에 실패했습니다.');
    process.exitCode = 1;
  });
}
