import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  deploymentAssetUrl,
  deploymentManifestUrl,
  normalizeDeploymentBaseUrl,
} from './release-deployment-url.mjs';
import {
  ArtifactIntegrityError,
  EndpointUnavailableError,
  acceptsManifestVersion,
  cancelResponseBody,
  endpointFailureBlocksRelease,
  isDurableApkMirrorUrl,
  requiresCompleteProvenance,
} from './release-validation-policy.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
await readReleasePolicy(root);
const argv = process.argv.slice(2);
const args = new Set(argv);
const configOnly = args.has('--config-only');
const requireDurableApk = args.has('--require-durable-apk');
const checkUrls = args.has('--check-urls');
const verifyApkContent = args.has('--verify-apk-content');
const verifyOnlineManifest = args.has('--verify-online-manifest');
const verifyProvenanceArtifact = args.has('--verify-provenance-artifact');
const allowHistoricalManifestVersion = args.has(
  '--allow-historical-manifest-version',
);
const manifestArgumentIndex = argv.indexOf('--manifest');
const manifestArgument =
  manifestArgumentIndex >= 0 ? argv[manifestArgumentIndex + 1] : undefined;
const deploymentBaseArgumentIndex = argv.indexOf('--deployment-base-url');
const deploymentBaseArgument =
  deploymentBaseArgumentIndex >= 0
    ? argv[deploymentBaseArgumentIndex + 1]
    : undefined;

if (manifestArgumentIndex >= 0 && !manifestArgument) {
  throw new Error('--manifest 다음에 배포 정보 파일 경로를 입력해 주세요.');
}
if (deploymentBaseArgumentIndex >= 0 && !deploymentBaseArgument) {
  throw new Error('--deployment-base-url 다음에 불변 배포 주소를 입력해 주세요.');
}
const deploymentBaseUrl = deploymentBaseArgument
  ? normalizeDeploymentBaseUrl(deploymentBaseArgument)
  : null;

if (
  allowHistoricalManifestVersion &&
  (!requireDurableApk ||
    !checkUrls ||
    !verifyApkContent ||
    !verifyOnlineManifest)
) {
  throw new Error(
    '--allow-historical-manifest-version은 이전 배포를 온라인에서 완전히 검증할 때만 사용할 수 있어요.',
  );
}
if (verifyProvenanceArtifact && (!checkUrls || !verifyApkContent)) {
  throw new Error(
    '--verify-provenance-artifact는 URL과 APK 내용을 함께 검증할 때만 사용할 수 있어요.',
  );
}

const manifestPath = resolve(
  root,
  manifestArgument ?? 'public/updates/latest-android.json',
);
const manifestRelativePath = relative(root, manifestPath);
if (
  manifestRelativePath === '..' ||
  manifestRelativePath.startsWith(`..${sep}`) ||
  isAbsolute(manifestRelativePath)
) {
  throw new Error('프로젝트 밖의 APK 배포 정보 파일은 검사할 수 없어요.');
}

const readJson = async (path) =>
  JSON.parse(await readFile(resolve(root, path), 'utf8'));

const [pkg, app, eas, manifest] = await Promise.all([
  readJson('package.json'),
  readJson('app.json'),
  readJson('eas.json'),
  readFile(manifestPath, 'utf8').then(JSON.parse),
]);

const errors = [];
const warnings = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};
const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

try {
  const require = createRequire(import.meta.url);
  const xcode = require('xcode');
  const project = xcode.project('compatibility-check.pbxproj');
  project.hash = { project: { objects: {} } };
  expect(
    /^[0-9A-F]{24}$/.test(project.generateUuid()),
    '보안 수정된 uuid와 Expo의 xcode 도구가 호환되지 않아요.',
  );
} catch {
  errors.push('보안 수정된 uuid와 Expo의 xcode 도구 호환성을 확인하지 못했어요.');
}

const stableBuildScript = pkg.scripts?.['build:apk'] ?? '';
const stableUpdateScript = pkg.scripts?.['publish:update'] ?? '';
expect(
  /--profile\s+stable(?:\s|$)/.test(stableBuildScript) &&
    !/--profile\s+(?:preview|canary)(?:\s|$)/.test(stableBuildScript),
  '기본 APK 빌드는 stable 프로필만 사용해야 해요.',
);
expect(
  /--channel\s+stable(?:\s|$)/.test(stableUpdateScript) &&
    /--environment\s+production(?:\s|$)/.test(stableUpdateScript) &&
    !/--channel\s+(?:preview|canary)(?:\s|$)/.test(stableUpdateScript),
  '기본 무선 업데이트는 stable 채널과 production 환경만 사용해야 해요.',
);
expect(!eas.build?.preview, '실수 방지를 위해 preview 빌드 프로필을 두면 안 돼요.');
expect(eas.build?.stable?.channel === 'stable', 'stable 빌드는 stable 채널이어야 해요.');
expect(
  eas.build?.stable?.environment === 'production',
  'stable 빌드는 production 환경이어야 해요.',
);
expect(
  eas.build?.stable?.android?.buildType === 'apk',
  'stable 안드로이드 빌드는 APK 형식이어야 해요.',
);
expect(eas.build?.canary?.channel === 'canary', '시험 빌드는 canary 채널이어야 해요.');
expect(
  app.expo?.runtimeVersion?.policy === 'appVersion',
  '무선 업데이트 런타임은 앱 버전 정책을 사용해야 해요.',
);
expect(pkg.version === app.expo?.version, 'package.json과 app.json 버전이 같아야 해요.');
if (!configOnly) {
  const acceptedVersion = acceptsManifestVersion({
    allowHistorical: allowHistoricalManifestVersion,
    appVersionCode: app.expo?.android?.versionCode,
    appVersionName: app.expo?.version,
    manifestVersionCode: manifest.versionCode,
    manifestVersionName: manifest.versionName,
  });
  expect(manifest.schemaVersion === 1, 'APK 배포 정보 형식 버전이 올바르지 않아요.');
  expect(
    manifest.packageName === app.expo?.android?.package,
    'APK 배포 정보의 패키지 이름이 앱과 같아야 해요.',
  );
  expect(
    acceptedVersion.versionNameAccepted,
    'APK 배포 정보의 버전 이름이 앱 버전과 같아야 해요.',
  );
  expect(
    acceptedVersion.versionCodeAccepted,
    'APK 배포 정보의 버전 코드가 앱 버전 코드와 같아야 해요.',
  );
  expect(
    typeof manifest.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(manifest.sha256),
    'APK 배포 정보의 SHA-256이 올바르지 않아요.',
  );
  expect(
    Number.isInteger(manifest.sizeBytes) &&
      manifest.sizeBytes >= 1024 * 1024 &&
      manifest.sizeBytes <= 350 * 1024 * 1024,
    'APK 배포 정보의 파일 크기가 올바르지 않아요.',
  );
  expect(
    typeof manifest.publishedAt === 'string' &&
      Number.isFinite(Date.parse(manifest.publishedAt)),
    'APK 배포 정보의 배포 시각이 올바르지 않아요.',
  );
  expect(
    manifest.apkMirrors === undefined ||
      (Array.isArray(manifest.apkMirrors) && manifest.apkMirrors.length <= 4),
    'APK 미러 주소는 최대 네 개까지 사용할 수 있어요.',
  );
  const provenanceFields = [
    manifest.nativeFingerprint,
    manifest.provenanceArtifactUrl,
    manifest.provenanceArtifactSha256,
    manifest.provenanceVerifiedAt,
    manifest.easBuildFinishedAt,
  ];
  const requiresProvenance = requiresCompleteProvenance({
    allowHistorical: allowHistoricalManifestVersion,
    isCurrentVersion:
      manifest.versionCode === app.expo?.android?.versionCode,
    provenanceValues: provenanceFields,
  });
  if (requiresProvenance) {
    expect(
      typeof manifest.nativeFingerprint === 'string' &&
        /^[0-9a-f]{64}$/iu.test(manifest.nativeFingerprint),
      'APK 네이티브 호환 지문이 올바르지 않아요.',
    );
    expect(
      typeof manifest.sourceCommit === 'string' &&
        /^[0-9a-f]{40}$/iu.test(manifest.sourceCommit),
      'APK 소스 커밋이 올바르지 않아요.',
    );
    expect(
      typeof manifest.easBuildId === 'string' && manifest.easBuildId.length >= 8,
      'EAS 빌드 ID가 올바르지 않아요.',
    );
    expect(
      typeof manifest.provenanceArtifactUrl === 'string' &&
        isHttpsUrl(manifest.provenanceArtifactUrl),
      'EAS provenance APK 주소가 올바르지 않아요.',
    );
    expect(
      typeof manifest.provenanceArtifactSha256 === 'string' &&
        /^[0-9a-f]{64}$/iu.test(manifest.provenanceArtifactSha256) &&
        manifest.provenanceArtifactSha256.toLowerCase() ===
          manifest.sha256?.toLowerCase(),
      'EAS provenance APK SHA-256이 공개 APK와 일치하지 않아요.',
    );
    expect(
      typeof manifest.provenanceVerifiedAt === 'string' &&
        Number.isFinite(Date.parse(manifest.provenanceVerifiedAt)),
      'EAS provenance 검증 시각이 올바르지 않아요.',
    );
    expect(
      typeof manifest.easBuildFinishedAt === 'string' &&
        Number.isFinite(Date.parse(manifest.easBuildFinishedAt)),
      'EAS 빌드 완료 시각이 올바르지 않아요.',
    );
  }
}

const manifestUrls = app.expo?.extra?.apkUpdateManifestUrls ?? [];
expect(
  Array.isArray(manifestUrls) &&
    manifestUrls.length > 0 &&
    manifestUrls.length <= 5 &&
    manifestUrls.every(isHttpsUrl) &&
    new Set(manifestUrls).size === manifestUrls.length,
  'APK 배포 정보 주소를 중복 없이 최대 다섯 개의 HTTPS 배열로 설정해야 해요.',
);

const apkEndpoints = configOnly
  ? []
  : [
      {
        isPrimary: true,
        isRequired: true,
        isDurableMirror: false,
        label: 'APK 공개 원본',
        url: deploymentBaseUrl
          ? deploymentAssetUrl(deploymentBaseUrl, manifest.apkUrl)
          : manifest.apkUrl,
      },
      ...(verifyProvenanceArtifact && manifest.provenanceArtifactUrl
        ? [
            {
              isPrimary: true,
              isRequired: true,
              isDurableMirror: false,
              label: 'EAS provenance 산출물',
              url: manifest.provenanceArtifactUrl,
            },
          ]
        : []),
      ...(manifest.apkMirrors ?? []).map((url) => {
        const isDurableMirror = isDurableApkMirrorUrl(url);
        return {
          isPrimary: false,
          isRequired: requireDurableApk && isDurableMirror,
          isDurableMirror,
          label: isDurableMirror ? '장기 보관 APK 미러' : '선택 APK 미러',
          url,
        };
      }),
    ];
const apkUrls = apkEndpoints.map(({ url }) => url);
if (!configOnly) {
  expect(apkUrls.length > 0 && apkUrls.every(isHttpsUrl), 'APK 주소는 모두 HTTPS여야 해요.');
  expect(new Set(apkUrls).size === apkUrls.length, 'APK 기본 주소와 미러 주소가 중복되면 안 돼요.');
}

const durableMirrorEndpoints = apkEndpoints.filter(
  ({ isDurableMirror }) => isDurableMirror,
);
if (!configOnly && durableMirrorEndpoints.length === 0) {
  const message = 'EAS 임시 주소 외에 장기 보관 APK 미러를 한 개 이상 추가해야 해요.';
  if (requireDurableApk) errors.push(message);
  else warnings.push(message);
}
if (!configOnly && manifest.artifactExpiresAt) {
  const expiresAt = Date.parse(manifest.artifactExpiresAt);
  expect(Number.isFinite(expiresAt), 'APK 임시 주소 만료일이 올바르지 않아요.');
  expect(expiresAt > Date.now(), 'APK 임시 주소가 이미 만료됐어요.');
}

async function assertUrlAvailable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (response.status === 405 || response.status === 501) {
      await cancelResponseBody(response);
      response = await fetch(url, {
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
        signal: controller.signal,
      });
    }
    if (!response.ok && response.status !== 206) {
      await cancelResponseBody(response);
      throw new Error(`HTTP ${response.status}`);
    }
    await cancelResponseBody(response);
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

async function assertApkContent(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.android.package-archive' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      await cancelResponseBody(response);
      throw new EndpointUnavailableError(`HTTP ${response.status}`);
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > 0 && declaredLength !== manifest.sizeBytes) {
      await cancelResponseBody(response);
      throw new ArtifactIntegrityError(
        `파일 크기 불일치: ${declaredLength} / ${manifest.sizeBytes}`,
      );
    }

    const hash = createHash('sha256');
    let receivedBytes = 0;
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      receivedBytes += bytes.length;
      if (receivedBytes > manifest.sizeBytes) {
        controller.abort();
        throw new ArtifactIntegrityError('배포 정보보다 큰 파일을 받았어요.');
      }
      hash.update(bytes);
    }
    if (receivedBytes !== manifest.sizeBytes) {
      throw new ArtifactIntegrityError(
        `파일 크기 불일치: ${receivedBytes} / ${manifest.sizeBytes}`,
      );
    }
    const actualSha256 = hash.digest('hex');
    if (actualSha256.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new ArtifactIntegrityError('SHA-256이 배포 정보와 일치하지 않아요.');
    }
  } catch (error) {
    if (
      error instanceof ArtifactIntegrityError ||
      error instanceof EndpointUnavailableError
    ) {
      throw error;
    }
    throw new EndpointUnavailableError(
      error instanceof Error ? error.message : '알 수 없는 연결 오류',
      { cause: error },
    );
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

function comparableManifest(value) {
  return {
    schemaVersion: value?.schemaVersion,
    packageName: value?.packageName,
    versionCode: value?.versionCode,
    versionName: value?.versionName,
    apkUrl: value?.apkUrl,
    apkMirrors: value?.apkMirrors ?? [],
    sha256: value?.sha256,
    sizeBytes: value?.sizeBytes,
    publishedAt: value?.publishedAt,
    artifactExpiresAt: value?.artifactExpiresAt ?? null,
    sourceCommit: value?.sourceCommit ?? null,
    easBuildId: value?.easBuildId ?? null,
    easBuildFinishedAt: value?.easBuildFinishedAt ?? null,
    nativeFingerprint: value?.nativeFingerprint ?? null,
    provenanceArtifactSha256: value?.provenanceArtifactSha256 ?? null,
    provenanceArtifactUrl: value?.provenanceArtifactUrl ?? null,
    provenanceVerifiedAt: value?.provenanceVerifiedAt ?? null,
    updateGroup: value?.updateGroup ?? null,
    notes: value?.notes ?? [],
  };
}

async function assertOnlineManifestMatches(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const separator = url.includes('?') ? '&' : '?';
    const verificationUrl = `${url}${separator}verify=${Date.now()}`;
    const response = await fetch(verificationUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const onlineManifest = await response.json();
    if (
      JSON.stringify(comparableManifest(onlineManifest)) !==
      JSON.stringify(comparableManifest(manifest))
    ) {
      throw new Error('온라인 배포 정보가 로컬 최종본과 달라요.');
    }
  } finally {
    clearTimeout(timeout);
  }
}

const unavailableMirrors = new Set();
if (checkUrls) {
  for (const endpoint of apkEndpoints) {
    try {
      await assertUrlAvailable(endpoint.url);
    } catch (error) {
      if (!endpoint.isPrimary) unavailableMirrors.add(endpoint.url);
      if (
        endpointFailureBlocksRelease({
          error,
          isPrimary: endpoint.isPrimary,
          isRequired: endpoint.isRequired,
        })
      ) {
        errors.push(
          `${endpoint.label} 주소를 확인하지 못했어요: ${endpoint.url} (${error instanceof Error ? error.message : '알 수 없는 오류'})`,
        );
      } else {
        warnings.push(
          `선택 APK 미러를 확인하지 못했지만 원본 검증은 계속해요: ${endpoint.url} (${error instanceof Error ? error.message : '알 수 없는 오류'})`,
        );
      }
    }
  }
}

if (verifyApkContent && !configOnly) {
  if (apkEndpoints.length === 0) {
    errors.push('내용을 검증할 APK 주소가 없어요.');
  } else {
    for (const endpoint of apkEndpoints) {
      if (!endpoint.isPrimary && unavailableMirrors.has(endpoint.url)) continue;
      try {
        await assertApkContent(endpoint.url);
      } catch (error) {
        const message = `${endpoint.label} 내용을 검증하지 못했어요: ${endpoint.url} (${error instanceof Error ? error.message : '알 수 없는 오류'})`;
        if (
          endpointFailureBlocksRelease({
            error,
            isPrimary: endpoint.isPrimary,
            isRequired: endpoint.isRequired,
          })
        ) {
          errors.push(message);
        } else {
          warnings.push(`선택 미러 ${message}`);
        }
      }
    }
  }
}

if (verifyOnlineManifest && !configOnly) {
  const onlineManifestUrls = deploymentBaseUrl
    ? [deploymentManifestUrl(deploymentBaseUrl)]
    : manifestUrls;
  for (const manifestUrl of onlineManifestUrls) {
    try {
      await assertOnlineManifestMatches(manifestUrl);
    } catch (error) {
      errors.push(
        `온라인 APK 배포 정보를 확인하지 못했어요: ${manifestUrl} (${error instanceof Error ? error.message : '알 수 없는 오류'})`,
      );
    }
  }
}

for (const warning of warnings) console.warn(`주의: ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`오류: ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    configOnly
      ? 'stable 배포 설정을 확인했어요.'
      : 'stable 배포 설정과 APK 배포 정보를 확인했어요.',
  );
}
