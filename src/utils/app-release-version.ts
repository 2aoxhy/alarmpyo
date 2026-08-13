/** 1.0.x 기술 버전을 사용자용 V00 형식으로 바꿔요. */
export function formatAppReleaseVersion(version: string | null | undefined): string {
  const match = /^1\.0\.(\d+)$/u.exec(version ?? '');
  if (!match) return 'V--';
  return `V${Number(match[1]).toString().padStart(2, '0')}`;
}
