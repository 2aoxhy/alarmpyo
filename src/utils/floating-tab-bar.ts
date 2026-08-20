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

export type FloatingTabBarGeometry = {
  left: number;
  right: number;
  sideGuard: number;
  width: number;
};

const BASE_HEIGHT = 68;
const MIN_BOTTOM = 8;
const CONTENT_GAP = 8;
const MAX_WIDTH = 560;

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

/**
 * 좌우 안전 영역이 달라도 하단 메뉴의 중심을 화면 중심축에 고정합니다.
 * 더 큰 안전 영역을 양쪽에 동일하게 적용해 노치나 제스처 영역을 침범하지 않습니다.
 */
export function resolveFloatingTabBarGeometry(
  windowWidth: number,
  leftInset: number,
  rightInset: number,
  outerMargin: number,
  maxWidth = MAX_WIDTH,
): FloatingTabBarGeometry {
  const safeWindowWidth = finiteNonNegative(windowWidth);
  const sideGuard = Math.max(
    finiteNonNegative(leftInset),
    finiteNonNegative(rightInset),
    finiteNonNegative(outerMargin),
  );
  const availableWidth = Math.max(safeWindowWidth - sideGuard * 2, 0);
  const width = Math.min(availableWidth, finiteNonNegative(maxWidth));
  const symmetricInset = (safeWindowWidth - width) / 2;

  return {
    left: symmetricInset,
    right: symmetricInset,
    sideGuard,
    width,
  };
}

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
