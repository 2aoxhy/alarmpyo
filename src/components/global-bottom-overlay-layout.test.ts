import { describe, expect, it } from 'vitest';

import {
  resolveGlobalBottomOverlayBottom,
  resolveScreenContentBottomInset,
} from './global-bottom-overlay-layout';

describe('전역 하단 오버레이 레이아웃', () => {
  it('탭 바와 현재 footer 중 더 높은 컨트롤 위에 상태 바를 둡니다', () => {
    expect(resolveGlobalBottomOverlayBottom(84, 0, 8)).toBe(92);
    expect(resolveGlobalBottomOverlayBottom(84, 132, 8)).toBe(140);
  });

  it('footer가 없으면 상태 바 전체 높이를 콘텐츠 아래 여백에 반영합니다', () => {
    expect(
      resolveScreenContentBottomInset({
        floatingControlInset: 84,
        footerInset: null,
        footerPadding: 24,
        globalOverlayInset: 156,
        overlayGap: 8,
      }),
    ).toBe(164);
  });

  it('footer가 있으면 footer 위에 놓인 상태 바 높이만 추가합니다', () => {
    expect(
      resolveScreenContentBottomInset({
        floatingControlInset: 84,
        footerInset: 80,
        footerPadding: 24,
        globalOverlayInset: 152,
        overlayGap: 8,
      }),
    ).toBe(104);
  });

  it('상태 바가 없으면 기존 탭·footer 여백을 유지합니다', () => {
    expect(
      resolveScreenContentBottomInset({
        floatingControlInset: 84,
        footerInset: null,
        footerPadding: 24,
        globalOverlayInset: 0,
        overlayGap: 8,
      }),
    ).toBe(84);
    expect(
      resolveScreenContentBottomInset({
        floatingControlInset: 84,
        footerInset: 80,
        footerPadding: 24,
        globalOverlayInset: 0,
        overlayGap: 8,
      }),
    ).toBe(24);
  });
});
