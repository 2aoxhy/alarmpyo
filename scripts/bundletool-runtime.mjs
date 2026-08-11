import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

export const BUNDLETOOL_VERSION = '1.18.3';
export const BUNDLETOOL_SHA256 =
  'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29';
export const BUNDLETOOL_URL =
  `https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar`;

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function cachePath() {
  const root = process.env.ALARMPYO_TOOL_CACHE ||
    resolve(process.env.LOCALAPPDATA || resolve(homedir(), '.cache'), 'alarmpyo-tools');
  return resolve(root, `bundletool-all-${BUNDLETOOL_VERSION}.jar`);
}

export async function ensureBundletool() {
  const configured = process.env.BUNDLETOOL_JAR;
  const jarPath = configured ? resolve(configured) : cachePath();
  if (existsSync(jarPath)) {
    if ((await sha256(jarPath)) === BUNDLETOOL_SHA256) return jarPath;
    if (configured) {
      throw new Error('BUNDLETOOL_JAR 파일의 SHA-256가 고정된 bundletool과 달라요.');
    }
    await rm(jarPath, { force: true });
  }

  await mkdir(dirname(jarPath), { recursive: true });
  const temporaryPath = `${jarPath}.${process.pid}.tmp`;
  const response = await fetch(BUNDLETOOL_URL, {
    headers: { 'User-Agent': 'AlarmPyo-release-validator' },
    redirect: 'follow',
  });
  if (!response.ok || !response.body) {
    throw new Error(`bundletool을 받지 못했어요. HTTP ${response.status}`);
  }
  const expectedSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(expectedSize) && expectedSize > 40 * 1024 * 1024) {
    throw new Error('bundletool 파일이 예상보다 커요.');
  }
  try {
    await finished(
      Readable.fromWeb(response.body).pipe(createWriteStream(temporaryPath, { flags: 'wx' })),
    );
    const digest = await sha256(temporaryPath);
    if (digest !== BUNDLETOOL_SHA256) {
      throw new Error(`bundletool SHA-256가 달라요. 실제 ${digest}`);
    }
    await rename(temporaryPath, jarPath);
    return jarPath;
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function runJavaTool(mainArgs, options = {}) {
  const javaExecutable = process.env.JAVA_HOME
    ? resolve(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : 'java';
  const result = spawnSync(javaExecutable, mainArgs, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`Java를 실행하지 못했어요: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      [result.stderr, result.stdout].filter(Boolean).join('\n').trim() ||
        `Java 도구가 종료 코드 ${result.status}로 실패했어요.`,
    );
  }
  return result.stdout;
}

export async function runBundletool(args, options) {
  const jarPath = await ensureBundletool();
  return runJavaTool(['-jar', jarPath, ...args], options);
}
