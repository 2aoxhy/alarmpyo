import { describe, expect, it, vi } from 'vitest';

import { targetMatchesFocusVisible } from '../use-web-focus-visible';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

describe('웹 focus-visible 판별', () => {
  it('브라우저의 focus-visible 선택자 결과를 사용해요', () => {
    const matches = vi.fn(() => true);
    const target = { matches };

    expect(targetMatchesFocusVisible(target)).toBe(true);
    expect(matches).toHaveBeenCalledWith(':focus-visible');
    expect(matches.mock.contexts[0]).toBe(target);
  });

  it('마우스 포커스처럼 focus-visible이 아니면 외곽선을 숨겨요', () => {
    expect(
      targetMatchesFocusVisible({ matches: () => false }),
    ).toBe(false);
  });

  it('선택자 판별을 지원하지 않는 웹 환경에서는 포커스를 보수적으로 표시해요', () => {
    expect(targetMatchesFocusVisible({})).toBe(true);
    expect(
      targetMatchesFocusVisible({
        matches: () => {
          throw new Error('unsupported selector');
        },
      }),
    ).toBe(true);
  });
});
