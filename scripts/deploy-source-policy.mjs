const RELEASE_TRANSACTION_PATHS = new Set([
  'public/updates/latest-android.json',
  'public/updates/previous-android.json',
]);

export function assertDeploySourceState({
  allowedReleasePaths = [],
  allowedReleasePrefixes = [],
  changes,
  releaseTransaction,
}) {
  if (!releaseTransaction && changes.length > 0) {
    throw new Error('커밋되지 않은 변경이 있어 웹 배포를 시작할 수 없어요.');
  }
  if (!releaseTransaction) return;

  const normalizedAllowedReleasePaths = new Set([
    ...RELEASE_TRANSACTION_PATHS,
    ...allowedReleasePaths.map((path) => path.replaceAll('\\', '/')),
  ]);
  const unexpected = changes.filter((path) => {
    const normalizedPath = path.replaceAll('\\', '/');
    return (
      !normalizedAllowedReleasePaths.has(normalizedPath) &&
      !allowedReleasePrefixes.some((prefix) =>
        normalizedPath.startsWith(prefix.replaceAll('\\', '/')),
      )
    );
  });
  if (unexpected.length > 0) {
    throw new Error(
      `APK 승격 중 허용되지 않은 변경이 있어 웹 배포를 중단했어요: ${unexpected.join(', ')}`,
    );
  }
}
