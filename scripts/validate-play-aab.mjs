import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';

import {
  BUNDLETOOL_SHA256,
  BUNDLETOOL_VERSION,
  runBundletool,
} from './bundletool-runtime.mjs';
import {
  assertBundlePageAlignment16K,
  assertNoForbiddenDexStrings,
  assertPlayJavascriptBundle,
  readPlayReleasePolicy,
  validatePlayManifest,
  validateProvenanceBinding,
} from './play-release-policy.mjs';
import {
  assertPlaySigningBootstrapAllowed,
} from './play-signing-bootstrap.mjs';
import { readZipEntries } from './zip-entry-reader.mjs';
import { normalizeEasBuildProvenance } from './release-artifact-provenance.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');

export function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const [name, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined && value && !value.startsWith('--')) index += 1;
    values.set(name, inlineValue ?? (value?.startsWith('--') ? true : value ?? true));
  }
  return values;
}

async function sha256(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function hashRemoteArtifact(url, expectedSize) {
  const response = await fetch(url, {
    headers: { Accept: 'application/octet-stream,*/*' },
    redirect: 'follow',
  });
  if (!response.ok || !response.body) {
    throw new Error(`EAS AAB 원본을 받지 못했어요. HTTP ${response.status}`);
  }
  const digest = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    sizeBytes += chunk.length;
    if (sizeBytes > expectedSize) {
      throw new Error('EAS AAB 원본이 로컬 AAB보다 커요.');
    }
    digest.update(chunk);
  }
  if (sizeBytes !== expectedSize) {
    throw new Error(`EAS AAB 원본 크기가 달라요. EAS ${sizeBytes} / 로컬 ${expectedSize}`);
  }
  return digest.digest('hex');
}

function git(args) {
  const result = spawnSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) {
    throw new Error('소스 Git 정보를 확인하지 못했어요.');
  }
  return result.stdout.trim();
}

function verifyJarSignature(aabPath) {
  const executable = process.env.JAVA_HOME
    ? resolve(
        process.env.JAVA_HOME,
        'bin',
        process.platform === 'win32' ? 'jarsigner.exe' : 'jarsigner',
      )
    : 'jarsigner';
  // Android 서명 키는 일반적으로 자체 서명 인증서를 사용해요.
  // -strict는 정상 Android 서명도 신뢰 체인 경고로 실패시키므로 무결성 검증만 실행해요.
  const result = spawnSync(executable, ['-verify', aabPath], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`AAB 서명 검증 도구를 실행하지 못했어요: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      [result.stderr, result.stdout].filter(Boolean).join('\n').trim() ||
        'AAB JAR 서명 검증에 실패했어요.',
    );
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function validatePlayAab({
  aabPath,
  provenanceOut,
  provenancePath,
  easBuildEvidencePath = null,
  requireCleanSource = true,
  allowPlaySigningBootstrap = false,
}) {
  const policyOptions = allowPlaySigningBootstrap ? { allowBlocked: true } : {};
  const directPolicy = await readReleasePolicy(root, { allowBlocked: true });
  const playPolicy = await readPlayReleasePolicy(root, directPolicy, policyOptions);
  const releaseContext = allowPlaySigningBootstrap
    ? assertPlaySigningBootstrapAllowed({ directPolicy, playPolicy })
    : {
        purpose: 'play-release',
        buildProfile: 'production',
        submissionEligible: true,
      };
  const absoluteAabPath = resolve(root, aabPath);
  const aabStat = await stat(absoluteAabPath).catch(() => null);
  if (!aabStat?.isFile() || aabStat.size < 1024 * 1024) {
    throw new Error('검증할 AAB 파일을 찾지 못했거나 파일이 너무 작아요.');
  }

  const sourceCommit = git(['rev-parse', 'HEAD']);
  const sourceDirty = git(['status', '--porcelain']).length > 0;
  if (requireCleanSource && sourceDirty) {
    throw new Error('변경 중인 소스에서는 Play AAB 출처 기록을 생성할 수 없어요.');
  }

  const app = JSON.parse(await readFile(resolve(root, 'app.json'), 'utf8')).expo;
  const expected = {
    packageName: app.android.package,
    versionCode: app.android.versionCode,
    versionName: app.version,
    targetSdk: playPolicy.targetSdk,
  };
  if (playPolicy.packageName !== expected.packageName) {
    throw new Error('Play 배포 정책의 패키지가 앱 설정과 달라요.');
  }
  if (
    playPolicy.bundletool?.version !== BUNDLETOOL_VERSION ||
    playPolicy.bundletool?.sha256 !== BUNDLETOOL_SHA256
  ) {
    throw new Error('Play 배포 정책의 bundletool 고정값이 검증기와 달라요.');
  }

  await runBundletool(['validate', `--bundle=${absoluteAabPath}`], { cwd: root });
  const bundleConfig = await runBundletool(
    ['dump', 'config', `--bundle=${absoluteAabPath}`],
    { cwd: root },
  );
  const pageAlignment = assertBundlePageAlignment16K(bundleConfig);
  const manifestXml = await runBundletool(
    ['dump', 'manifest', `--bundle=${absoluteAabPath}`, '--module=base'],
    { cwd: root },
  );
  const manifest = validatePlayManifest(manifestXml, expected);

  const dexEntries = await readZipEntries(
    absoluteAabPath,
    (name) => /^base\/dex\/classes[^/]*\.dex$/iu.test(name),
  );
  if (dexEntries.length === 0) throw new Error('AAB에서 base DEX 파일을 찾지 못했어요.');
  assertNoForbiddenDexStrings(dexEntries);

  const javascriptEntries = await readZipEntries(
    absoluteAabPath,
    (name) =>
      name.startsWith('base/assets/') &&
      (name.endsWith('.bundle') || name.endsWith('.hbc') || name.includes('index.android')),
  );
  if (javascriptEntries.length === 0) {
    throw new Error('AAB에서 Android JavaScript 번들을 찾지 못했어요.');
  }
  assertPlayJavascriptBundle(javascriptEntries);
  verifyJarSignature(absoluteAabPath);

  const artifact = {
    schemaVersion: 1,
    artifactType: 'android-app-bundle',
    fileName: basename(absoluteAabPath),
    sizeBytes: aabStat.size,
    sha256: await sha256(absoluteAabPath),
    packageName: manifest.packageName,
    versionName: manifest.versionName,
    versionCode: manifest.versionCode,
    targetSdk: manifest.targetSdk,
    pageAlignment,
    distribution: 'play',
    releasePurpose: releaseContext.purpose,
    submissionEligible: releaseContext.submissionEligible,
    signed: true,
    sourceCommit,
    sourceDirty,
    easBuildId: null,
    provenanceArtifactUrl: null,
    validatedAt: new Date().toISOString(),
    validator: {
      bundletoolVersion: BUNDLETOOL_VERSION,
      bundletoolSha256: BUNDLETOOL_SHA256,
    },
  };

  if (easBuildEvidencePath) {
    const evidence = JSON.parse(
      await readFile(resolve(root, easBuildEvidencePath), 'utf8'),
    );
    const provenance = normalizeEasBuildProvenance(evidence, {
      buildProfile: releaseContext.buildProfile,
      versionName: app.version,
      versionCode: app.android.versionCode,
      projectId: app.extra?.eas?.projectId,
    });
    if (provenance.sourceCommit !== sourceCommit) {
      throw new Error('EAS AAB를 만든 소스 커밋과 현재 저장소 커밋이 달라요.');
    }
    const remoteSha256 = await hashRemoteArtifact(
      provenance.artifactUrl,
      artifact.sizeBytes,
    );
    if (remoteSha256 !== artifact.sha256) {
      throw new Error(`EAS AAB SHA-256가 로컬 AAB와 달라요. EAS ${remoteSha256} / 로컬 ${artifact.sha256}`);
    }
    artifact.easBuildId = provenance.easBuildId;
    artifact.provenanceArtifactUrl = provenance.artifactUrl;
    artifact.easBuildFinishedAt = provenance.finishedAt;
  }

  if (provenancePath) {
    const recorded = JSON.parse(await readFile(resolve(root, provenancePath), 'utf8'));
    validateProvenanceBinding(recorded, artifact);
  }
  if (provenanceOut) await writeJsonAtomic(resolve(root, provenanceOut), artifact);
  return artifact;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const aabPath = args.get('--aab') || process.env.ALARMPYO_AAB_PATH;
  if (typeof aabPath !== 'string') {
    throw new Error('--aab 또는 ALARMPYO_AAB_PATH로 AAB 파일을 지정해 주세요.');
  }
  const defaultProvenance = resolve(
    '.release',
    'play',
    `${basename(aabPath)}.provenance.json`,
  );
  const artifact = await validatePlayAab({
    aabPath,
    provenanceOut:
      args.get('--no-write-provenance') === true
        ? null
        : String(args.get('--provenance-out') || defaultProvenance),
    provenancePath:
      typeof args.get('--provenance') === 'string' ? args.get('--provenance') : null,
    easBuildEvidencePath:
      typeof args.get('--eas-build') === 'string'
        ? args.get('--eas-build')
        : process.env.ALARMPYO_EAS_BUILD_EVIDENCE ?? null,
    requireCleanSource: args.get('--allow-dirty') !== true,
  });
  console.log(
    `Play AAB 검증을 완료했어요. ${artifact.packageName} ${artifact.versionName}(${artifact.versionCode}) · targetSdk ${artifact.targetSdk} · ${artifact.pageAlignment} · SHA-256 ${artifact.sha256}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
