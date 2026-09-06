// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('평면형 디자인 시스템 계약', () => {
  it('공통 표면은 상하 구분선만 사용하고 elevated도 그림자를 만들지 않아요', () => {
    const contents = source('src/design-system/surface.tsx');

    expect(contents).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(contents).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(contents).toContain('borderRadius: shape.section');
    expect(contents).not.toContain('boxShadow');
    expect(contents).not.toContain('shadowOpacity');
    expect(contents).not.toContain('elevation:');
  });

  it('버튼은 control radius와 불투명도 눌림만 사용해요', () => {
    const contents = source('src/design-system/button.tsx');

    expect(contents).toContain('borderRadius: shape.control');
    expect(contents).toContain('opacity: interaction.emphasizedPressedOpacity');
    expect(contents).not.toContain('transform: [{ scale:');
  });

  it('선택 컨트롤은 pill 대신 구분선과 3px 선택선을 사용해요', () => {
    const contents = source('src/design-system/segmented-control.tsx');

    expect(contents).toContain('borderRadius: shape.section');
    expect(contents).toContain('borderBottomWidth: 3');
    expect(contents).toContain('borderLeftWidth: 3');
    expect(contents).toContain('optionDividerStacked');
    expect(contents).not.toContain('radius.md');
    expect(contents).not.toContain('radius.lg');
  });

  it('중앙 팝업과 하단 시트는 작은 의미 radius만 쓰고 그림자를 만들지 않아요', () => {
    const modal = source('src/design-system/modal-surface.tsx');
    const sheet = source('src/components/app-sheet.tsx');

    expect(modal).toContain('borderRadius: shape.overlay');
    expect(modal).not.toContain('shadowOpacity');
    expect(sheet).toContain('borderTopLeftRadius: shape.sheetTop');
    expect(sheet).toContain('borderBottomLeftRadius: shape.section');
    expect(sheet).not.toContain('styles.handle');
    expect(sheet).not.toContain('shadowOpacity');
  });

  it('sticky footer와 하단 내비게이션은 장식 그림자 없이 한 표면을 사용해요', () => {
    const footer = source('src/design-system/sticky-action-bar.tsx');
    const tabs = source('src/app/(tabs)/_layout.tsx');

    expect(footer).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(footer).not.toContain('shadowOpacity');
    expect(footer).not.toContain('elevation:');
    expect(tabs).toContain('borderRadius: shape.panel');
    expect(tabs).toContain('borderRadius: shape.section');
    expect(tabs).toContain('height: 3');
    expect(tabs).toContain('left: tabBarGeometry.inset');
    expect(tabs).not.toContain('floatingTabShadow');
  });

  it('대화상자와 저장 안내는 작은 shape 토큰만 쓰고 장식 그림자를 만들지 않아요', () => {
    const dialog = source('src/components/app-dialog.tsx');
    const banner = source('src/components/save-error-banner.tsx');
    const toast = source('src/components/save-toast.tsx');

    expect(dialog).toContain('borderRadius: shape.overlay');
    expect(banner).toContain('borderRadius: shape.overlay');
    expect(toast).toContain('borderRadius: shape.panel');
    for (const contents of [dialog, banner, toast]) {
      expect(contents).not.toContain('shadowOpacity');
      expect(contents).not.toContain('boxShadow');
      expect(contents).not.toContain('elevation:');
    }
  });

  it('화면의 눌림 피드백은 축소 애니메이션 대신 불투명도를 사용해요', () => {
    const paths = [
      'src/components/date-picker-field.tsx',
      'src/components/selection-controls.tsx',
      'src/features/calendar/calendar-month-card.tsx',
      'src/features/calendar/calendar-support-sections.tsx',
      'src/features/pattern-library/pattern-application-preview.tsx',
      'src/features/today/today-guidance-section.tsx',
    ];

    for (const path of paths) {
      expect(source(path)).not.toContain('transform: [{ scale:');
    }
  });
});
