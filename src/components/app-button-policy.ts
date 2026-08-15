import type { AppIconName } from '@/components/app-icon';

const EMPTY_BUTTON_LABEL = '계속';

export type AppButtonActionId =
  | 'confirm'
  | 'save'
  | 'back'
  | 'test-alarm'
  | 'retry'
  | 'open-settings'
  | 'download'
  | 'delete'
  | 'cancel';

const ACTION_ICONS: Readonly<
  Partial<Record<AppButtonActionId, AppIconName>>
> = {
  confirm: 'checkmark',
  save: 'checkmark',
  back: 'chevron-back',
  'test-alarm': 'alarm-outline',
  retry: 'refresh-outline',
  'open-settings': 'settings-outline',
  download: 'download-outline',
  delete: 'trash-outline',
  cancel: 'close',
};

/** 동적 문구가 비어 있어도 버튼에 안전한 행동명을 표시합니다. */
export function resolveAppButtonLabel(label: string): string {
  return label.trim() || EMPTY_BUTTON_LABEL;
}

/** 버튼 아이콘은 표시 문구가 아닌 명시적인 행동 식별자로 결정합니다. */
export function resolveAppButtonIcon(
  actionId?: AppButtonActionId,
  icon?: AppIconName,
): AppIconName | undefined {
  return icon ?? (actionId ? ACTION_ICONS[actionId] : undefined);
}
