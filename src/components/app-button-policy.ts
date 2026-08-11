import type { AppIconName } from '@/components/app-icon';

const EMPTY_BUTTON_LABEL = '계속하기';

/** 동적으로 만든 문구가 비어도 버튼 자체가 빈 상자로 보이지 않게 해요. */
export function resolveAppButtonLabel(label: string): string {
  return label.trim() || EMPTY_BUTTON_LABEL;
}

/** 앱 전역의 반복 동작은 같은 아이콘을 사용해 화면마다 의미가 달라 보이지 않게 해요. */
export function resolveAppButtonIcon(
  label: string,
  icon?: AppIconName,
): AppIconName | undefined {
  if (icon) return icon;

  const normalizedLabel = resolveAppButtonLabel(label);
  if (normalizedLabel.includes('시험 알람')) return 'alarm-outline';
  if (
    normalizedLabel === '저장하기' ||
    normalizedLabel === '저장 중' ||
    normalizedLabel === '다시 저장하기' ||
    normalizedLabel.startsWith('변경 내용 저장')
  ) {
    return 'checkmark';
  }
  if (normalizedLabel === '뒤로 가기' || normalizedLabel.endsWith('돌아가기')) {
    return 'chevron-back';
  }
  return undefined;
}
