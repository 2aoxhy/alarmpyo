/** V14까지의 1.0.x와 V15부터의 1.x 버전을 사용자용 릴리스명으로 바꿔요. */
export function formatAppReleaseVersion(version: string | null | undefined): string {
  const legacy = /^1\.0\.(\d+)$/u.exec(version ?? '');
  if (legacy) return `V${Number(legacy[1]).toString().padStart(2, '0')}`;
  const compact = /^1\.(\d+)$/u.exec(version ?? '');
  if (!compact || Number(compact[1]) < 15) return 'V--';
  return `V${Number(compact[1])}`;
}
