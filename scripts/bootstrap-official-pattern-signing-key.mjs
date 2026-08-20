import { generateKeyPairSync } from 'node:crypto';
import {
  realpath,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  SHIFT_PATTERN_ALGORITHM,
  parseJsonStrict,
  parseManifest,
  parsePublicKeyring,
  rawPublicKeyFromKeyObject,
} from './shift-pattern-node-contract.mjs';

const root = resolve(import.meta.dirname, '..');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function pathIsInside(candidate, parent) {
  const path = relative(parent, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export async function bootstrapOfficialPatternSigningKey({
  privateKeyOutput,
  officialRoot = resolve(root, 'official-patterns'),
} = {}) {
  if (!privateKeyOutput || !isAbsolute(privateKeyOutput)) {
    throw new Error('비공개키를 임시로 저장할 절대 경로를 지정해야 합니다.');
  }
  const output = resolve(privateKeyOutput);
  const realRepositoryRoot = await realpath(root);
  const realOutputParent = await realpath(dirname(output));
  if (pathIsInside(realOutputParent, realRepositoryRoot)) {
    throw new Error('비공개키는 저장소 밖의 임시 경로에만 만들 수 있습니다.');
  }
  try {
    await stat(output);
    throw new Error('비공개키 출력 파일이 이미 있습니다. 덮어쓰지 않습니다.');
  } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error;
  }

  const manifestPath = resolve(officialRoot, 'manifest.json');
  const keyringPath = resolve(officialRoot, 'public-keyring.json');
  const manifest = parseManifest(
    parseJsonStrict(await readFile(manifestPath, 'utf8'), '공식 패턴 manifest'),
  );
  const keyring = parsePublicKeyring(
    parseJsonStrict(await readFile(keyringPath, 'utf8'), '공식 패턴 공개키 keyring'),
  );
  if (keyring.keys.some((key) => key.id === manifest.keyId)) {
    throw new Error('manifest 공개키 ID가 이미 등록되어 있습니다. 자동으로 교체하지 않습니다.');
  }

  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  });
  const publicKeyBase64 = rawPublicKeyFromKeyObject(publicKey).toString('base64');
  const nextKeyring = {
    schemaVersion: 1,
    algorithm: SHIFT_PATTERN_ALGORITHM,
    keys: [
      ...keyring.keys,
      {
        id: manifest.keyId,
        algorithm: SHIFT_PATTERN_ALGORITHM,
        publicKeyBase64,
      },
    ],
  };
  const temporaryKeyringPath = `${keyringPath}.tmp-${process.pid}`;
  let privateWritten = false;
  try {
    await writeFile(output, privateKey, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    privateWritten = true;
    await writeFile(temporaryKeyringPath, `${JSON.stringify(nextKeyring, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o644,
    });
    await rename(temporaryKeyringPath, keyringPath);
  } catch (error) {
    await rm(temporaryKeyringPath, { force: true }).catch(() => undefined);
    if (privateWritten) await rm(output, { force: true }).catch(() => undefined);
    throw error;
  }
  return { keyId: manifest.keyId, privateKeyOutput: output };
}

async function main() {
  const privateKeyOutput = argumentValue('--private-key-output');
  const result = await bootstrapOfficialPatternSigningKey({ privateKeyOutput });
  // 비공개키 내용은 stdout/stderr에 절대 기록하지 않습니다.
  console.log(`공개키 ${result.keyId}를 keyring에 등록했습니다.`);
  console.log(`비공개키 임시 파일을 GitHub Environment secret에 등록한 뒤 즉시 삭제해야 합니다: ${result.privateKeyOutput}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : '공식 패턴 서명키 준비에 실패했습니다.');
    process.exitCode = 1;
  });
}
