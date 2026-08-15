import type { AppIconName } from '@/components/app-icon';

export type AppDialogTone = 'neutral' | 'success' | 'warning' | 'danger';

type AppDialogPresentation = Readonly<{
  icon: AppIconName;
  paletteRole: 'indigo' | 'mintDark' | 'amber' | 'danger';
}>;

const DIALOG_PRESENTATIONS: Readonly<
  Record<AppDialogTone, AppDialogPresentation>
> = {
  neutral: { icon: 'alert-circle-outline', paletteRole: 'indigo' },
  success: { icon: 'checkmark-circle', paletteRole: 'mintDark' },
  warning: { icon: 'alert-circle-outline', paletteRole: 'amber' },
  danger: { icon: 'alert-circle-outline', paletteRole: 'danger' },
};

/** 대화상자 표현은 제목 문구가 아니라 호출자가 지정한 의미를 따릅니다. */
export function resolveAppDialogPresentation(
  tone: AppDialogTone,
): AppDialogPresentation {
  return DIALOG_PRESENTATIONS[tone];
}
