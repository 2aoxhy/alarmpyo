// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(fileName: string): string {
  return readFileSync(
    resolve(process.cwd(), 'src/features/pattern-library', fileName),
    'utf8',
  );
}

function appSource(fileName: string): string {
  return readFileSync(resolve(process.cwd(), 'src/app', fileName), 'utf8');
}

describe('pattern accessibility and responsive contract', () => {
  it('reflows every day editor at 320dp and 150 percent or larger text', () => {
    const editor = source('pattern-sequence-day-editor.tsx');
    expect(editor).toContain('width <= 320 || fontScale >= 1.5');
    expect(editor).toContain('styles.optionStacked');
    expect(editor).toContain('accessibilityRole="radiogroup"');
  });

  it('virtualizes 1 to 42 days as a strip and edits only the selected day', () => {
    const editor = source('pattern-sequence-day-editor.tsx');
    const route = appSource('pattern-library-edit.tsx');

    expect(editor).toContain('export const PatternSequenceStrip');
    expect(editor).toContain('<FlatList');
    expect(editor).toContain('initialNumToRender={8}');
    expect(route).toContain('<PatternSequenceStrip');
    expect(route).toContain('selectedIndex={activeIndex}');
    expect(route).toContain('code={draft.shiftCodes[activeIndex]}');
    expect(route).not.toContain('renderItem={({ index, item }) => (');
  });

  it('uses segment composition first and keeps the day editor behind advanced disclosure', () => {
    const composer = source('pattern-segment-composer.tsx');
    const route = appSource('pattern-library-edit.tsx');

    expect(composer).toContain('export const PatternSegmentComposer');
    expect(composer).toContain('BASIC_SHIFT_OPTIONS');
    expect(composer).toContain('SUBSTITUTE_SHIFT_OPTIONS');
    expect(composer).toContain('직전 작업 취소');
    expect(composer).toContain('구간 추가');
    expect(route).toContain('<PatternSegmentComposer');
    expect(route).toContain('title="날짜별 상세 편집"');
    expect(route).toContain('{advancedEditorOpen ? (');
    expect(route.indexOf('<PatternSegmentComposer')).toBeLessThan(
      route.indexOf('<PatternSequenceStrip'),
    );
  });

  it('uses an automatic pattern name until the user opts into editing it', () => {
    const route = appSource('pattern-library-edit.tsx');
    expect(route).toContain('formatPatternComposerName');
    expect(route).toContain("label={customName ? '자동 이름' : '이름 수정'}");
    expect(route).toContain('{nameEditorOpen ? (');
  });

  it('shows pattern-name errors only after blur or save', () => {
    const route = appSource('pattern-library-edit.tsx');
    expect(route).toContain('const [nameTouched, setNameTouched] = useState(false)');
    expect(route).toContain('const [submitAttempted, setSubmitAttempted] = useState(false)');
    expect(route).toContain('onBlur={() => setNameTouched(true)}');
    expect(route).toContain('(nameTouched || submitAttempted)');
  });

  it('exposes selection state through radio or checkbox state only once', () => {
    const editor = source('pattern-sequence-day-editor.tsx');
    const preview = source('pattern-application-preview.tsx');
    expect(editor).toContain('accessibilityRole="radio"');
    expect(preview).toContain('accessibilityRole="checkbox"');
    expect(editor).not.toContain('선택됨');
    expect(preview).not.toContain('선택됨');
  });

  it('keeps all status and override copy visible without forced line limits', () => {
    const sources = [
      source('pattern-sequence-day-editor.tsx'),
      source('pattern-application-preview.tsx'),
      source('pattern-vault-card.tsx'),
    ].join('\n');
    expect(sources).not.toContain('numberOfLines');
    expect(sources).not.toContain('opacity:');
  });

  it('shows Store preview rows in a month calendar with a selected-day comparison', () => {
    const preview = source('pattern-application-preview.tsx');
    const apply = appSource('pattern-library-apply.tsx');
    expect(preview).toContain('buildCalendarGrid');
    expect(preview).toContain('buildPatternPreviewMonths(rows)');
    expect(preview).toContain('현재 ${selectedRow.currentLabel}');
    expect(preview).toContain('적용 후 ${selectedRow.nextLabel}');
    expect(preview).toContain('label={`변경 ${changedDateCount}일`}');
    expect(preview).not.toContain('<Card density="compact" key={row.dateKey}');
    expect(apply).toContain('createPatternApplicationPreview(data,');
    expect(apply).not.toContain('향후 42일');
    expect(apply).not.toContain('42일 비교');
  });

  it('shows seven days first and keeps the full 42 day calendar collapsed', () => {
    const preview = source('pattern-application-preview.tsx');
    expect(preview).toContain(
      'buildPatternSevenDaySummary({ mode, rows, selectedDateKeys })',
    );
    expect(preview).toContain("? '직접 수정 유지'");
    expect(preview).toContain(": '직접 수정 제거'");
    expect(preview).toContain('title="42일 전체 보기"');
    expect(preview).toContain('{calendarExpanded ? (');
    expect(preview.indexOf('<PatternSevenDaySummaryView')).toBeLessThan(
      preview.indexOf('title="42일 전체 보기"'),
    );
  });

  it('hides override policy when there are no direct edits and keeps preserve as default', () => {
    const apply = appSource('pattern-library-apply.tsx');
    expect(apply).toContain("useState<OverrideResolutionMode>('preserve')");
    expect(apply).toContain('preview.directOverrideDateKeys.length > 0 ? (');
    expect(apply).toContain('title="직접 수정"');
    expect(apply).toContain('formatPatternApplyActionLabel');
  });

  it('keeps direct-edit policy controls usable at 320dp and large text', () => {
    const preview = source('pattern-application-preview.tsx');
    const apply = appSource('pattern-library-apply.tsx');
    expect(preview).toContain('width <= 320 || fontScale >= 1.5');
    expect(preview).toContain('width <= 412 || fontScale >= 1.3');
    expect(preview).toContain('styles.comparisonStacked');
    expect(preview).toContain('styles.shiftTokensStacked');
    expect(preview).toContain('selected && styles.dayNumberRowSelected');
    expect(preview).toContain('accessibilityRole="checkbox"');
    expect(apply).toContain('accessibilityRole="radiogroup"');
    expect(apply).toContain('styles.policyGridStacked');
    expect(apply).toContain('width <= 360 || fontScale >= 1.3');
  });

  it('does not repeat the native vault title or render a disabled stored action', () => {
    const library = appSource('pattern-library.tsx');
    expect(library).toContain("<Stack.Screen options={{ title: '패턴 보관함' }} />");
    expect(library).not.toContain('<SectionHeader centered title="근무 패턴 보관함" />');
    expect(library).toContain('{!alreadyStored ? (');
    expect(library).not.toContain("label={alreadyStored ? '보관됨' : '검증본 보관'}");
  });

  it('fetches official patterns only from screen entry or the refresh action', () => {
    const library = appSource('pattern-library.tsx');
    const controller = source('pattern-library-controller.ts');
    expect(controller).toContain("refreshOfficialPatterns('entry')");
    expect(library).toContain("refreshOfficialPatterns('manual')");
    expect(controller).toContain('const [officialLoading, setOfficialLoading] = useState(false)');
    expect(controller).not.toContain("setBusyOperation('official-fetch')");
    expect(controller).not.toContain('setInterval(');
    expect(controller).not.toContain('AppState');
  });

  it('keeps import, storage, preview, and application as separate actions', () => {
    const library = appSource('pattern-library.tsx');
    const controller = source('pattern-library-controller.ts');
    const apply = appSource('pattern-library-apply.tsx');
    expect(controller).toContain('pickAndValidateShiftPatternFile');
    expect(controller).toContain('importValidatedPattern');
    expect(library).not.toContain('applyPatternFromVault');
    expect(apply).toContain('createPatternApplicationPreview(data,');
    expect(apply).toContain('applyPatternFromVault');
    expect(apply).not.toContain('buildPatternDiffRows');
    expect(apply).not.toContain('pickAndValidateShiftPatternFile');
  });

  it('fails closed for invalid official integrity and connects history rollback', () => {
    const library = appSource('pattern-library.tsx');
    expect(library).toContain('파일을 열지 않았습니다');
    expect(library).toContain('rollbackLastPatternApplication');
    expect(library).toContain('data.patternHistory.slice(0, 10)');
  });

  it('routes applied vault patterns away from the base-only work pattern editor', () => {
    const patternEditor = appSource('pattern.tsx');
    expect(patternEditor).toContain("data.appliedPatternSource !== 'legacy'");
    expect(patternEditor).toContain("router.replace('/pattern-library'");
    expect(patternEditor).toContain('현재 근무표 유지');
  });

  it('keeps field copy short and removes repeated reassurance banners', () => {
    const library = appSource('pattern-library.tsx');
    const editor = appSource('pattern-library-edit.tsx');
    const apply = appSource('pattern-library-apply.tsx');
    const preview = source('pattern-application-preview.tsx');

    for (const oldCopy of [
      '가져오기와 적용 분리',
      '설정 보호',
      '앞으로 7일을 먼저 확인하고',
      '전체 42일 비교',
    ]) {
      expect([library, editor, apply, preview].join('\n')).not.toContain(oldCopy);
    }
    expect(editor).toContain('근무 순서만 저장');
    expect(apply).toContain('근무 순서만 적용 · 시간·알람·권한 유지');
  });

  it('uses a flat active rail and a direct delete title', () => {
    const library = appSource('pattern-library.tsx');
    const vaultCard = source('pattern-vault-card.tsx');

    expect(library).toContain("'패턴 삭제'");
    expect(library).not.toContain('삭제하시겠습니까');
    expect(vaultCard).toContain('borderLeftWidth: 3');
    expect(vaultCard).not.toContain('borderWidth: 2');
  });
});
