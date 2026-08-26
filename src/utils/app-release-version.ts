const VERSION_NAME_STYLE_FROM_CODE = 21;

/** V14까지의 1.0.x, V15~V20, V1.21부터의 표시 규칙을 적용해요. */
export function formatAppReleaseVersion(version: string | null | undefined): string {
  const legacy = /^1\.0\.(\d+)$/u.exec(version ?? '');
  if (legacy) return `V${Number(legacy[1]).toString().padStart(2, '0')}`;
  const compact = /^1\.(\d+)$/u.exec(version ?? '');
  if (!compact || Number(compact[1]) < 15) return 'V--';
  const minor = Number(compact[1]);
  return minor < VERSION_NAME_STYLE_FROM_CODE ? `V${minor}` : `V1.${minor}`;
}

/** Play Core가 제공하는 versionCode를 사용자용 릴리스명으로 바꿔요. */
export function formatAppReleaseVersionCode(versionCode: number): string {
  if (!Number.isInteger(versionCode) || versionCode <= 0) return '새 버전';
  return versionCode < VERSION_NAME_STYLE_FROM_CODE
    ? `V${versionCode}`
    : `V1.${versionCode}`;
}
