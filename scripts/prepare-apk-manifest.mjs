import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { getPublicApkPathSegments } from './apk-public-path.mjs';
import {
  readApkMetadata,
  readApkSigningCertificateSha256,
} from './read-apk-metadata.mjs';
import {
  createAndroidNativeFingerprint,
  normalizeEasBuildProvenance,
} from './release-artifact-provenance.mjs';
import { assertDurableApkMirrors } from './release-ledger.mjs';
import {
  assertReleaseVersionIsNewer,
  assertTrustedSigningCertificates,
  hashFileSha256,
  readReleasePolicy,
} from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const values = new Map();
const flags = new Set();
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index];
  if (!token.startsWith('--')) continue;
  if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
    const existing = values.get(token) ?? [];
    existing.push(argv[index + 1]);
    values.set(token, existing);
    index += 1;
  } else {
    flags.add(token);
  }
}

const first = (name, envName) => values.get(name)?.[0] ?? process.env[envName];
const fail = (message) => {
  console.error(`오류: ${message}`);
  process.exit(1);
};
const readCurrentCommit = () => {
  const result = spawnSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'],
    { cwd: root, encoding: 'utf8' },
  );
  const commit = result.stdout?.trim().toLowerCase();
  return result.status === 0 && /^[0-9a-f]{40}$/u.test(commit ?? '')
    ? commit
    : null;
};
const readJson = async (path) =>
  JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''));
const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const isEphemeralEasArtifact = (value) => {
  const url = new URL(value);
  return url.hostname === 'expo.dev' && url.pathname.includes('/artifacts/eas/');
};

async function hashRemoteApk(url, expectedSize) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.android.package-archive,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`EAS APK를 내려받지 못했어요. HTTP ${response.status}`);
  }
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > 350 * 1024 * 1024) {
    throw new Error('EAS APK 파일이 허용 크기를 초과했어요.');
  }
  const hash = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of response.body) {
    sizeBytes += chunk.byteLength;
    if (sizeBytes > 350 * 1024 * 1024) {
      throw new Error('EAS APK 파일이 허용 크기를 초과했어요.');
    }
    hash.update(chunk);
  }
  if (sizeBytes !== expectedSize) {
    throw new Error(
      `EAS APK 크기가 승격 대상과 달라요. EAS ${sizeBytes}바이트 / 로컬 ${expectedSize}바이트`,
    );
  }
  return { sha256: hash.digest('hex'), sizeBytes };
}

const apkPathValue = first('--apk', 'ALARMPYO_APK_PATH');
const primaryUrl = first('--url', 'ALARMPYO_APK_URL');
const outputValue =
  first('--output', 'ALARMPYO_MANIFEST_OUTPUT') ?? '.release/latest-android.json';
const easBuildMetadataValue =
  first('--eas-build-metadata', 'ALARMPYO_EAS_BUILD_METADATA_PATH') ??
  process.env.ALARMPYO_EAS_BUILD_METADATA_PATH ??
  '.release/eas-build.json';
const expiresAt = first('--expires-at', 'ALARMPYO_APK_EXPIRES_AT') ?? null;
const requestedSourceCommit =
  first('--source-commit', 'ALARMPYO_SOURCE_COMMIT') ??
  process.env.EAS_BUILD_GIT_COMMIT_HASH ??
  null;
const requestedEasBuildId = first('--eas-build-id', 'EAS_BUILD_ID') ?? null;
const updateGroup = first('--update-group', 'ALARMPYO_UPDATE_GROUP') ?? null;
const cliMirrors = values.get('--mirror') ?? [];
const envMirrors = (process.env.ALARMPYO_APK_MIRRORS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
let mirrors = [...new Set([...cliMirrors, ...envMirrors])].filter(
  (value) => value !== primaryUrl,
);
const cliNotes = values.get('--note') ?? [];
const envNotes = (process.env.ALARMPYO_RELEASE_NOTES ?? '')
  .split('|')
  .map((value) => value.trim())
  .filter(Boolean);
const notes = [...cliNotes, ...envNotes]
  .map((value) => value.trim())
  .filter(Boolean);

if (!apkPathValue) fail('--apk 또는 ALARMPYO_APK_PATH로 APK 파일을 지정해 주세요.');
if (!primaryUrl) fail('--url 또는 ALARMPYO_APK_URL로 공개 APK 주소를 지정해 주세요.');
const urls = [primaryUrl, ...mirrors];
if (urls.length > 5 || !urls.every(isHttpsUrl)) {
  fail('APK 기본 주소와 최대 네 개의 미러 주소는 모두 HTTPS여야 해요.');
}
if (
  !flags.has('--allow-ephemeral') &&
  isEphemeralEasArtifact(primaryUrl)
) {
  fail('stable 배포 정보에는 EAS 임시 주소가 아닌 장기 보관 주소가 필요해요.');
}
if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
  fail('APK 주소 만료일은 ISO 날짜 형식이어야 해요.');
}
if (updateGroup && (updateGroup.length > 100 || /[\r\n]/u.test(updateGroup))) {
  fail('업데이트 그룹 식별값이 올바르지 않아요.');
}
if (notes.length > 8 || notes.some((note) => note.length > 160)) {
  fail('업데이트 내용은 160자 이하로 최대 여덟 개까지 입력할 수 있어요.');
}

const apkPath = resolve(root, apkPathValue);
const outputPath = resolve(root, outputValue);
const easBuildMetadataPath = resolve(root, easBuildMetadataValue);
let app;
let apkStat;
let releasePolicy;
let easBuildEvidence;
try {
  [app, apkStat, releasePolicy, easBuildEvidence] = await Promise.all([
    readJson(resolve(root, 'app.json')),
    stat(apkPath),
    readReleasePolicy(root),
    readJson(easBuildMetadataPath),
  ]);
} catch (error) {
  if (error?.code === 'ENOENT' && error?.path === easBuildMetadataPath) {
    fail(
      'EAS 빌드 증거 파일이 없어요. `eas build:view <빌드 ID> --json` 결과를 .release/eas-build.json에 저장해 주세요.',
    );
  }
  fail(error instanceof Error ? error.message : '배포 입력 파일을 읽지 못했어요.');
}
if (!apkStat.isFile() || apkStat.size < 1024 * 1024 || apkStat.size > 350 * 1024 * 1024) {
  fail('APK 파일 크기가 허용 범위를 벗어났어요.');
}

let provenance;
try {
  provenance = normalizeEasBuildProvenance(easBuildEvidence, {
    buildProfile: 'stable',
    versionName: app.expo.version,
    versionCode: app.expo.android.versionCode,
    projectId: app.expo.extra?.eas?.projectId,
  });
} catch (error) {
  fail(error instanceof Error ? error.message : 'EAS 빌드 증거를 확인하지 못했어요.');
}
mirrors = mirrors.filter((value) => value !== provenance.artifactUrl);
try {
  assertDurableApkMirrors({ apkUrl: primaryUrl, apkMirrors: mirrors });
} catch (error) {
  fail(error instanceof Error ? error.message : 'APK 미러를 확인하지 못했어요.');
}
const currentCommit = readCurrentCommit();
if (!currentCommit || provenance.sourceCommit !== currentCommit) {
  fail('EAS APK를 만든 소스 커밋과 현재 저장소 커밋이 달라요.');
}
if (
  requestedSourceCommit &&
  requestedSourceCommit.toLowerCase() !== provenance.sourceCommit
) {
  fail('지정한 소스 커밋과 EAS 빌드 증거의 소스 커밋이 달라요.');
}
if (requestedEasBuildId && requestedEasBuildId !== provenance.easBuildId) {
  fail('지정한 EAS 빌드 ID와 EAS 빌드 증거가 달라요.');
}

let apkMetadata;
try {
  apkMetadata = await readApkMetadata(apkPath);
} catch (error) {
  fail(
    `APK 앱 정보를 확인하지 못했어요: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
  );
}
if (
  apkMetadata.packageName !== app.expo.android.package ||
  apkMetadata.versionCode !== app.expo.android.versionCode ||
  apkMetadata.versionName !== app.expo.version
) {
  fail(
    `APK 앱 정보가 현재 설정과 달라요. APK ${apkMetadata.packageName ?? '-'} ${apkMetadata.versionName ?? '-'}(${apkMetadata.versionCode ?? '-'}) / 설정 ${app.expo.android.package} ${app.expo.version}(${app.expo.android.versionCode})`,
  );
}
if (releasePolicy.packageName !== app.expo.android.package) {
  fail('APK 운영 배포 정책의 패키지 이름이 앱 설정과 달라요.');
}

let currentPublicManifest = null;
try {
  currentPublicManifest = await readJson(
    resolve(root, 'public', 'updates', 'latest-android.json'),
  );
} catch (error) {
  if (error?.code !== 'ENOENT') fail('현재 공개 APK 배포 정보를 읽지 못했어요.');
}
try {
  assertReleaseVersionIsNewer(app.expo.android.versionCode, currentPublicManifest);
  assertTrustedSigningCertificates(
    await readApkSigningCertificateSha256(apkPath),
    releasePolicy,
  );
} catch (error) {
  fail(error instanceof Error ? error.message : 'APK 운영 배포 정책을 확인하지 못했어요.');
}

const primary = new URL(primaryUrl);
try {
  const publicPathSegments = getPublicApkPathSegments(
    primary,
    releasePolicy.productionHostingUrl,
  );
  if (publicPathSegments) {
    if (
      publicPathSegments.length !== 2 ||
      publicPathSegments[0] !== `v${app.expo.android.versionCode}`
    ) {
      fail('공개 APK 주소의 버전 경로가 앱 versionCode와 일치해야 해요.');
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : '공개 APK 주소가 올바르지 않아요.');
}

let apkSha256;
let nativeFingerprint;
let remoteArtifact;
try {
  [apkSha256, nativeFingerprint, remoteArtifact] = await Promise.all([
    hashFileSha256(apkPath),
    createAndroidNativeFingerprint(root),
    hashRemoteApk(provenance.artifactUrl, apkStat.size),
  ]);
} catch (error) {
  fail(
    `EAS 빌드 산출물을 검증하지 못했어요: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
  );
}
if (remoteArtifact.sha256 !== apkSha256) {
  fail(
    `EAS APK SHA-256이 승격 대상과 달라요. EAS ${remoteArtifact.sha256} / 로컬 ${apkSha256}`,
  );
}
const provenanceVerifiedAt = new Date().toISOString();

const manifest = {
  schemaVersion: 1,
  packageName: app.expo.android.package,
  versionCode: app.expo.android.versionCode,
  versionName: app.expo.version,
  apkUrl: primaryUrl,
  apkMirrors: mirrors,
  sha256: apkSha256,
  sizeBytes: apkStat.size,
  publishedAt: provenanceVerifiedAt,
  artifactExpiresAt: expiresAt,
  sourceCommit: provenance.sourceCommit,
  easBuildId: provenance.easBuildId,
  easBuildFinishedAt: provenance.finishedAt,
  provenanceArtifactUrl: provenance.artifactUrl,
  provenanceArtifactSha256: remoteArtifact.sha256,
  provenanceVerifiedAt,
  nativeFingerprint,
  updateGroup,
  notes,
};

await mkdir(dirname(outputPath), { recursive: true });
const pendingOutputPath = `${outputPath}.pending`;
await rm(pendingOutputPath, { force: true });
await writeFile(pendingOutputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await rm(outputPath, { force: true });
await rename(pendingOutputPath, outputPath);
console.log(
  `공개 경로를 변경하지 않고 EAS 산출물과 연결한 비공개 APK 후보를 만들었어요: ${outputPath}`,
);
