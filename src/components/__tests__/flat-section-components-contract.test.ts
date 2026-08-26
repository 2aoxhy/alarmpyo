// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function section(contents: string, start: string, end: string) {
  return contents.slice(contents.indexOf(start), contents.indexOf(end));
}

describe('평면형 공통 컴포넌트 계약', () => {
  it('메뉴 그룹은 카드 대신 상하 구분선이 있는 평면 섹션을 사용해요', () => {
    const uiKit = source('src/components/ui-kit.tsx');
    const menuGroup = section(uiKit, 'export function MenuGroup', 'export function MenuDivider');

    expect(menuGroup).toContain('<View style={styles.menuGroupRows}>');
    expect(menuGroup).not.toContain('<Card');
    expect(uiKit).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(uiKit).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
  });

  it('목록 행 아이콘은 글자 크기와 관계없이 제목 첫 줄 중심에 맞춰요', () => {
    const uiKit = source('src/components/ui-kit.tsx');
    const listRow = section(uiKit, 'export function ListRow', 'export function MenuGroup');

    expect(listRow).toContain('{ height: titleLineHeight }');
    expect(listRow).not.toContain('<IconTile');
    expect(listRow).toContain("accessibilityRole={onPress ? 'button' : undefined}");
    expect(listRow).toContain('accessibilityState={onPress ?');
    expect(uiKit).toContain('width: controlSize.minimumTouchTarget');
    expect(listRow).toContain(
      'typeScale.label.lineHeight * Math.min(fontScale, 2)',
    );
    expect(uiKit).toContain("listRow: {\n    minHeight: 68,\n    flexDirection: 'row',\n    alignItems: 'center'");
    expect(uiKit).toContain(
      "listRowReflow: {\n    alignItems: 'stretch',\n    flexDirection: 'column'",
    );
    expect(uiKit).toContain('reflow && styles.listRowReflow');
    expect(listRow).toContain('reflow && styles.listRowMainReflow');
    expect(listRow).toContain('reflow && styles.listRowTrailingReflow');
  });

  it('상태 배너는 3px 의미선과 작은 아이콘, 박스 없는 동작을 사용해요', () => {
    const banner = source('src/design-system/status-banner.tsx');
    const actionStyles = section(banner, 'action: {', 'actionStacked: {');
    const contentRowStyles = section(banner, 'contentRow: {', 'icon: {');

    expect(banner).toContain('borderLeftWidth: 3');
    expect(banner).toContain('borderLeftColor: toneColors.foreground');
    expect(banner).toContain('size={size.iconSmall}');
    expect(banner).not.toContain('iconTile');
    expect(banner).not.toContain('borderRadius:');
    expect(actionStyles).not.toContain('backgroundColor:');
    expect(actionStyles).toContain('minHeight: size.minimumTouchTarget');
    expect(banner).toContain('accessibilityLiveRegion={liveRegion}');
    expect(banner).toContain('accessibilityRole="button"');
    expect(contentRowStyles).toContain("alignItems: 'flex-start'");
    expect(banner).toContain('{ height: firstLineHeight }');
  });

  it('펼침 행은 둥근 카드 없이 구분선과 큰 글자 재배치를 유지해요', () => {
    const disclosure = source('src/design-system/disclosure-row.tsx');

    expect(disclosure).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(disclosure).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(disclosure).not.toContain('borderRadius:');
    expect(disclosure).not.toContain('iconTile');
    expect(disclosure).toContain('width: size.minimumTouchTarget');
    expect(disclosure).toContain('height: size.minimumTouchTarget');
    expect(disclosure).toContain('const reflow = shouldReflowControl(width, fontScale);');
    expect(disclosure).toContain("flexDirection: 'column'");
    expect(disclosure).toContain('reflow && styles.mainContentReflow');
    expect(disclosure).toContain('reflow && styles.trailingReflow');
    expect(disclosure).toContain('accessibilityState={{ disabled, expanded }}');
  });

  it('토글 행도 아이콘 타일과 둥근 카드 없이 스위치 접근성을 유지해요', () => {
    const toggle = source('src/design-system/toggle-row.tsx');

    expect(toggle).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(toggle).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(toggle).not.toContain('borderRadius:');
    expect(toggle).not.toContain('iconTile');
    expect(toggle).toContain('accessibilityRole="switch"');
    expect(toggle).toContain('accessibilityState={{ checked: value, disabled }}');
    expect(toggle).toContain("flexDirection: 'column'");
    expect(toggle).toContain('reflow && styles.mainContentReflow');
    expect(toggle).toContain('reflow && styles.trailingReflow');
    expect(toggle).toContain('width: size.minimumTouchTarget');
    expect(toggle).toContain('height: size.minimumTouchTarget');
  });

  it('포커스를 잃은 탭 화면을 시각·터치·접근성 트리에서 숨겨요', () => {
    const uiKit = source('src/components/ui-kit.tsx');

    expect(uiKit).toContain('const isFocused = useIsFocused();');
    expect(uiKit).toContain('accessibilityElementsHidden={!isFocused}');
    expect(uiKit).toContain("isFocused ? 'auto' : 'no-hide-descendants'");
    expect(uiKit).toContain("display: 'none'");
  });
});
