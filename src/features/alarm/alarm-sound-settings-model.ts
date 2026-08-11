import type { AlarmSoundStatus } from '@/services/alarm-sound-service';

/** 사용할 수 없는 음원은 실제 네이티브 재생 순서에 맞춰 안내해요. */
export function getAlarmSoundFallbackMessage(
  status: AlarmSoundStatus,
): string | null {
  if (status.available) return null;
  return status.selected
    ? '선택한 음원을 사용할 수 없어 시스템 기본 알람음, 벨소리, 알림음 순서로 대체해요.'
    : '시스템 기본 알람음을 사용할 수 없어 벨소리나 알림음으로 대체해요.';
}

export function shouldStackAlarmSoundActions(
  viewportWidth: number,
  fontScale: number,
): boolean {
  const safeWidth = Number.isFinite(viewportWidth) ? viewportWidth : 320;
  const safeFontScale = Number.isFinite(fontScale) ? fontScale : 1;
  return safeWidth < 400 || safeFontScale >= 1.25;
}
