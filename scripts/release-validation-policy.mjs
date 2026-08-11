export class ArtifactIntegrityError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ArtifactIntegrityError';
  }
}

export class EndpointUnavailableError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'EndpointUnavailableError';
  }
}

export function acceptsManifestVersion({
  allowHistorical,
  appVersionCode,
  appVersionName,
  manifestVersionCode,
  manifestVersionName,
}) {
  const validHistoricalVersion =
    allowHistorical &&
    typeof manifestVersionName === 'string' &&
    manifestVersionName.trim().length > 0 &&
    Number.isInteger(manifestVersionCode) &&
    manifestVersionCode >= 1 &&
    manifestVersionCode <= appVersionCode;
  return {
    versionCodeAccepted:
      manifestVersionCode === appVersionCode || validHistoricalVersion,
    versionNameAccepted:
      manifestVersionName === appVersionName || validHistoricalVersion,
  };
}

export function createFullDeploymentValidationArgs({
  allowHistorical = false,
  baseUrl,
  manifestPath,
  verifyProvenanceArtifact = false,
}) {
  const args = [
    '--require-durable-apk',
    '--check-urls',
    '--verify-apk-content',
    '--verify-online-manifest',
  ];
  if (manifestPath) args.push('--manifest', manifestPath);
  if (allowHistorical) args.push('--allow-historical-manifest-version');
  if (verifyProvenanceArtifact) args.push('--verify-provenance-artifact');
  args.push('--deployment-base-url', baseUrl);
  return args;
}

export function isDurableApkMirrorUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !(url.hostname === 'expo.dev' && url.pathname.includes('/artifacts/eas/'))
    );
  } catch {
    return false;
  }
}

export function endpointFailureBlocksRelease({
  error,
  isPrimary,
  isRequired = false,
}) {
  return isPrimary || isRequired || error instanceof ArtifactIntegrityError;
}

export async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel();
  } catch {
    // 이미 소비했거나 잠긴 스트림도 검증 결과를 바꾸지 않아요.
  }
}

export function requiresCompleteProvenance({
  allowHistorical,
  isCurrentVersion,
  provenanceValues,
}) {
  return (
    !allowHistorical ||
    isCurrentVersion ||
    provenanceValues.some((value) => value !== undefined && value !== null)
  );
}
