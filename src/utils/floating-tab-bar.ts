export type FloatingTabBarLayout = {
  bottom: number;
  contentOffset: number;
  height: number;
};

export type FloatingTabBarHorizontalLayout = {
  horizontalPadding: number;
  itemMargin: number;
  outerMargin: number;
};

const BASE_HEIGHT = 68;
const MIN_BOTTOM = 8;
const CONTENT_GAP = 8;

export function resolveFloatingTabBarHorizontalLayout(
  windowWidth: number,
  tabCount: number,
): FloatingTabBarHorizontalLayout {
  const safeWidth = Number.isFinite(windowWidth) ? Math.max(windowWidth, 0) : 0;
  const safeTabCount = Number.isInteger(tabCount) ? Math.max(tabCount, 1) : 1;
  const compact = safeTabCount >= 4 && safeWidth <= 360;
  return compact
    ? { horizontalPadding: 3, itemMargin: 0, outerMargin: 4 }
    : { horizontalPadding: 5, itemMargin: 2, outerMargin: 12 };
}

/** 떠 있는 하단 메뉴와 화면 콘텐츠가 겹치지 않도록 같은 치수를 계산해요. */
export function resolveFloatingTabBarLayout(
  fontScale: number,
  bottomInset: number,
  web = false,
): FloatingTabBarLayout {
  const safeFontScale = Number.isFinite(fontScale)
    ? Math.min(Math.max(fontScale, 1), 2)
    : 1;
  const safeBottomInset = Number.isFinite(bottomInset)
    ? Math.max(bottomInset, 0)
    : 0;
  const height = Math.ceil(BASE_HEIGHT + (safeFontScale - 1) * 28);
  const bottom = web ? 12 : Math.max(safeBottomInset, MIN_BOTTOM);

  return {
    bottom,
    contentOffset: height + bottom + CONTENT_GAP,
    height,
  };
}
