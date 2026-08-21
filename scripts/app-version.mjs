const LEGACY_APP_VERSION = /^1\.0\.(\d+)$/u;
const COMPACT_APP_VERSION = /^1\.(\d+)$/u;
const NPM_VERSION = /^1\.(\d+)\.0$/u;

export function isSupportedAppVersion(value) {
  if (typeof value !== 'string') return false;
  if (LEGACY_APP_VERSION.test(value)) return true;
  const compact = COMPACT_APP_VERSION.exec(value);
  return compact !== null && Number(compact[1]) >= 15;
}

export function isSupportedPackageVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/u.test(value);
}

export function packageVersionMatchesApp(packageVersion, appVersion) {
  if (packageVersion === appVersion) return true;
  const npm = NPM_VERSION.exec(packageVersion ?? '');
  const compact = COMPACT_APP_VERSION.exec(appVersion ?? '');
  return (
    npm !== null &&
    compact !== null &&
    npm[1] === compact[1] &&
    Number(compact[1]) >= 15
  );
}

export function formatReleaseName(appVersion) {
  const legacy = LEGACY_APP_VERSION.exec(appVersion ?? '');
  if (legacy) return `V${Number(legacy[1]).toString().padStart(2, '0')}`;
  const compact = COMPACT_APP_VERSION.exec(appVersion ?? '');
  if (!compact || Number(compact[1]) < 15) return 'V--';
  return `V${Number(compact[1])}`;
}
