import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  loadP256PrivateKey,
  rawPublicKeyFromKeyObject,
  signOfficialPayload,
} from './shift-pattern-node-contract.mjs';
import { validateOfficialShiftPatternSources } from './validate-official-shift-pattern-sources.mjs';

const root = resolve(import.meta.dirname, '..');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function readSigningKeyFromEnvironment(environment = process.env) {
  const inline = environment.SHIFT_PATTERN_SIGNING_PRIVATE_KEY_PEM;
  const file = environment.SHIFT_PATTERN_SIGNING_PRIVATE_KEY_FILE;
  if ((inline ? 1 : 0) + (file ? 1 : 0) !== 1) {
    throw new Error(
      'SHIFT_PATTERN_SIGNING_PRIVATE_KEY_PEM 또는 SHIFT_PATTERN_SIGNING_PRIVATE_KEY_FILE 중 하나만 설정해야 합니다.',
    );
  }
  if (inline) return inline;
  try {
    return await readFile(resolve(file), 'utf8');
  } catch {
    throw new Error('지정한 공식 패턴 서명키 파일을 읽을 수 없습니다.');
  }
}

export async function signOfficialShiftPatterns({
  officialRoot = resolve(root, 'official-patterns'),
  outputDirectory,
  environment = process.env,
} = {}) {
  if (!outputDirectory) throw new Error('서명 파일 출력 디렉터리를 지정해야 합니다.');
  const { keyring, manifest, sources } = await validateOfficialShiftPatternSources({
    officialRoot,
  });
  const privateKeyPem = await readSigningKeyFromEnvironment(environment);
  const privateKey = loadP256PrivateKey(privateKeyPem);
  const actualPublicKeyBase64 = rawPublicKeyFromKeyObject(privateKey).toString('base64');
  const registeredKey = keyring.keys.find((key) => key.id === manifest.keyId);
  if (!registeredKey || registeredKey.publicKeyBase64 !== actualPublicKeyBase64) {
    throw new Error('Environment 서명키와 커밋된 공개키 keyring이 일치하지 않습니다.');
  }

  const outputRoot = resolve(outputDirectory);
  await mkdir(outputRoot, { recursive: true });
  const written = [];
  for (const source of sources) {
    const document = signOfficialPayload(source, privateKey);
    const fileName = `${source.id}.json`;
    const destination = resolve(outputRoot, fileName);
    if (!destination.startsWith(`${outputRoot}${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new Error('공식 패턴 출력 경로가 올바르지 않습니다.');
    }
    await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o644,
    });
    written.push(destination);
  }
  return written;
}

async function main() {
  const outputDirectory = argumentValue('--output-dir');
  const written = await signOfficialShiftPatterns({ outputDirectory });
  console.log(`공식 근무 패턴 서명 파일 ${written.length}개를 생성했습니다.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    // 비공개키 문자열이나 원본 예외를 출력하지 않고 계약 오류만 표시합니다.
    console.error(error instanceof Error ? error.message : '공식 패턴 서명에 실패했습니다.');
    process.exitCode = 1;
  });
}
