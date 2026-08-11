import { immutableDeploymentUrl } from './release-deployment-url.mjs';

export function assertPromotionResult(result, expectedIdentifier) {
  if (
    result?.identifier !== expectedIdentifier ||
    typeof result?.production?.url !== 'string'
  ) {
    throw new Error('운영 주소가 목표 불변 배포에 연결됐는지 확인하지 못했어요.');
  }
  return result;
}

export function resolvePreviousDeploymentState({
  environmentIdentifier,
  previousState,
  productionUrl,
}) {
  const identifier = environmentIdentifier ?? previousState?.identifier ?? null;
  if (!identifier) return null;
  const url =
    previousState?.identifier === identifier &&
    typeof previousState?.url === 'string'
      ? previousState.url
      : immutableDeploymentUrl(productionUrl, identifier);
  return { identifier, url };
}

export function manifestsHaveSameIdentity(actual, expected) {
  return (
    actual?.versionCode === expected?.versionCode &&
    actual?.sha256 === expected?.sha256 &&
    actual?.publishedAt === expected?.publishedAt
  );
}
