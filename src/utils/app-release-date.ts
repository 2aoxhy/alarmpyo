const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1_000;

/**
 * 업데이트 생성 시각을 사용자가 익숙한 일/월/연 형식으로 표시해요.
 * 서울은 일광 절약 시간을 사용하지 않아 고정 오프셋으로 날짜 경계를 안전하게 맞춰요.
 */
export function formatAppUpdateDate(createdAt: Date | null | undefined): string | null {
  if (!createdAt || !Number.isFinite(createdAt.getTime())) return null;
  const seoulDate = new Date(createdAt.getTime() + SEOUL_OFFSET_MS);
  const day = String(seoulDate.getUTCDate()).padStart(2, '0');
  const month = String(seoulDate.getUTCMonth() + 1).padStart(2, '0');
  const year = String(seoulDate.getUTCFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}
