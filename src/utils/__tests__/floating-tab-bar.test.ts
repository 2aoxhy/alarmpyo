import { describe, expect, it } from 'vitest';

import {
  resolveFloatingTabBarGeometry,
  resolveFloatingTabBarHorizontalLayout,
  resolveFloatingTabBarLayout,
} from '../floating-tab-bar';

describe('떠 있는 하단 메뉴 배치', () => {
  it('안전 영역과 메뉴 높이를 콘텐츠 여백에 모두 반영해요', () => {
    const layout = resolveFloatingTabBarLayout(1, 34);

    expect(layout.height).toBe(68);
    expect(layout.bottom).toBe(34);
    expect(layout.contentOffset).toBe(110);
  });

  it('큰 글씨에서도 메뉴와 콘텐츠가 겹치지 않아요', () => {
    const normal = resolveFloatingTabBarLayout(1, 0);
    const large = resolveFloatingTabBarLayout(2, 0);

    expect(large.height).toBeGreaterThan(normal.height);
    expect(large.contentOffset).toBeGreaterThan(normal.contentOffset);
    expect(large.contentOffset).toBe(
      large.height + large.bottom + 8,
    );
  });

  it.each([1, 1.3, 1.4, 1.5, 2])(
    '글자 배율 %s에서 메뉴 높이와 콘텐츠 여백을 같은 계약으로 계산해요',
    (fontScale) => {
      const layout = resolveFloatingTabBarLayout(fontScale, 24);
      expect(layout.contentOffset).toBe(layout.height + layout.bottom + 8);
      expect(layout.height).toBeGreaterThanOrEqual(68);
    },
  );

  it('웹에서는 안전 영역 대신 고정된 떠 있는 여백을 함께 사용해요', () => {
    const layout = resolveFloatingTabBarLayout(1.5, 48, true);

    expect(layout.bottom).toBe(12);
    expect(layout.contentOffset).toBe(layout.height + layout.bottom + 8);
  });

  it('잘못된 수치는 안전한 기본값으로 처리해요', () => {
    expect(resolveFloatingTabBarLayout(Number.NaN, Number.NaN)).toEqual({
      bottom: 8,
      contentOffset: 84,
      height: 68,
    });
  });

  it('4개 탭은 360dp 이하에서 바깥 여백을 줄여 라벨 공간을 확보해요', () => {
    expect(resolveFloatingTabBarHorizontalLayout(320, 4)).toEqual({
      horizontalPadding: 3,
      itemMargin: 0,
      outerMargin: 4,
    });
    expect(resolveFloatingTabBarHorizontalLayout(360, 4)).toEqual({
      horizontalPadding: 3,
      itemMargin: 0,
      outerMargin: 4,
    });
    expect(resolveFloatingTabBarHorizontalLayout(361, 4)).toEqual({
      horizontalPadding: 5,
      itemMargin: 2,
      outerMargin: 12,
    });
  });

  it.each([
    [320, 0, 0, 4],
    [360, 24, 0, 4],
    [412, 0, 24, 12],
    [768, 44, 0, 12],
    [1280, 0, 0, 12],
  ] as const)(
    '%idp와 좌우 안전 영역 %i·%i에서도 화면 중심축에 맞아요',
    (windowWidth, leftInset, rightInset, outerMargin) => {
      const geometry = resolveFloatingTabBarGeometry(
        windowWidth,
        leftInset,
        rightInset,
        outerMargin,
      );

      expect(geometry.left + geometry.width / 2).toBe(windowWidth / 2);
      expect(geometry.right).toBe(geometry.left);
      expect(geometry.left).toBeGreaterThanOrEqual(geometry.sideGuard);
      expect(windowWidth - geometry.left - geometry.width).toBeGreaterThanOrEqual(
        geometry.sideGuard,
      );
      expect(geometry.width).toBeLessThanOrEqual(560);
    },
  );

  it('비대칭 안전 영역은 더 큰 값을 양쪽에 같은 여백으로 적용해요', () => {
    expect(resolveFloatingTabBarGeometry(412, 28, 4, 12)).toEqual({
      left: 28,
      right: 28,
      sideGuard: 28,
      width: 356,
    });
  });

  it('잘못된 화면·안전 영역 값도 유한한 중앙 배치를 반환해요', () => {
    expect(
      resolveFloatingTabBarGeometry(Number.NaN, Number.NaN, -4, 12),
    ).toEqual({ left: 0, right: 0, sideGuard: 12, width: 0 });
  });
});
