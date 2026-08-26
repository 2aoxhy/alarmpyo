import { createContext, useContext } from 'react';

export type GlobalBottomOverlayLayoutValue = {
  /** 화면 아래에서 전역 오버레이 상단까지 확보해야 하는 전체 높이입니다. */
  contentInset: number;
  /** 현재 화면의 footer·선택 패널 높이를 전역 오버레이 위치 계산에 반영합니다. */
  registerBottomControlInset: (owner: string, inset: number) => void;
};

const DEFAULT_VALUE: GlobalBottomOverlayLayoutValue = {
  contentInset: 0,
  registerBottomControlInset: () => undefined,
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

export function resolveGlobalBottomOverlayBottom(
  defaultControlInset: number,
  registeredControlInset: number,
  gap: number,
): number {
  return (
    Math.max(
      finiteNonNegative(defaultControlInset),
      finiteNonNegative(registeredControlInset),
    ) + finiteNonNegative(gap)
  );
}

export function resolveScreenContentBottomInset({
  floatingControlInset,
  footerInset,
  footerPadding,
  globalOverlayInset,
  overlayGap,
}: {
  floatingControlInset: number;
  footerInset: number | null;
  footerPadding: number;
  globalOverlayInset: number;
  overlayGap: number;
}): number {
  const safeGlobalInset = finiteNonNegative(globalOverlayInset);
  const safeGap = safeGlobalInset > 0 ? finiteNonNegative(overlayGap) : 0;
  if (footerInset !== null) {
    return (
      finiteNonNegative(footerPadding) +
      Math.max(safeGlobalInset - finiteNonNegative(footerInset), 0) +
      safeGap
    );
  }
  return Math.max(
    finiteNonNegative(floatingControlInset),
    safeGlobalInset + safeGap,
  );
}

export const GlobalBottomOverlayLayoutContext =
  createContext<GlobalBottomOverlayLayoutValue>(DEFAULT_VALUE);

export function useGlobalBottomOverlayLayout(): GlobalBottomOverlayLayoutValue {
  return useContext(GlobalBottomOverlayLayoutContext);
}
