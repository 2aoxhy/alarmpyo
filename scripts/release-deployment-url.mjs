export function normalizeDeploymentBaseUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('배포 확인 주소는 HTTP 또는 HTTPS여야 해요.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

export function deploymentAssetUrl(baseUrl, sourceUrl) {
  const base = normalizeDeploymentBaseUrl(baseUrl);
  if (!base) return sourceUrl;
  const source = new URL(sourceUrl);
  return new URL(`${source.pathname}${source.search}`, base).toString();
}

export function deploymentManifestUrl(baseUrl) {
  const base = normalizeDeploymentBaseUrl(baseUrl);
  if (!base) return null;
  return new URL('updates/latest-android.json', base).toString();
}

export function immutableDeploymentUrl(productionUrl, identifier) {
  const url = normalizeDeploymentBaseUrl(productionUrl);
  if (!url || !/^[a-z0-9-]+$/u.test(identifier)) {
    throw new Error('불변 배포 식별자가 올바르지 않아요.');
  }
  if (!url.hostname.endsWith('.expo.app')) {
    throw new Error('불변 배포 주소를 계산할 수 없는 운영 도메인이에요.');
  }
  const projectHost = url.hostname.slice(0, -'.expo.app'.length);
  return `${url.protocol}//${projectHost}--${identifier}.expo.app/`;
}
