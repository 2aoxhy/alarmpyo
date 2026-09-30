import { Children, isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TabBarIcon, TabBarLabel } from './tab-bar-visuals';

vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('@/components/app-icon', () => ({ AppIcon: 'AppIcon' }));

describe('하단 메뉴의 공통 라벨·아이콘', () => {
  it.each(['오늘', '달력', '타이머', '설정'])('%s 전체 문구를 버튼 폭에 가운데 배치해요', (label) => {
    const tree = TabBarLabel({ children: label, color: '#FFFFFF' });

    expect(tree.props.children).toBe(label);
    expect(Object.assign({}, ...tree.props.style)).toMatchObject({
      alignSelf: 'stretch',
      width: '100%',
      textAlign: 'center',
      color: '#FFFFFF',
    });
    expect(tree.props).toMatchObject({
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.8,
      maxFontSizeMultiplier: 2,
      numberOfLines: 1,
      accessible: false,
    });
    expect(tree.props.allowFontScaling).not.toBe(false);
  });

  it.each([true, false])('선택 상태 %s에서도 아이콘 영역을 바꾸거나 별도 접근성 초점을 만들지 않아요', (focused) => {
    const tree = TabBarIcon({
      activeName: 'timer',
      inactiveName: 'timer-outline',
      color: '#FFFFFF',
      indicatorColor: '#88CCFF',
      focused,
    });
    const children = Children.toArray(tree.props.children);
    const icon = children[children.length - 1];
    expect(tree.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      style: { width: 32, height: 28 },
    });
    expect(children).toHaveLength(focused ? 2 : 1);
    expect(isValidElement(icon) && icon.props).toMatchObject({
      accessible: false,
      name: focused ? 'timer' : 'timer-outline',
      size: 22,
    });
  });
});
