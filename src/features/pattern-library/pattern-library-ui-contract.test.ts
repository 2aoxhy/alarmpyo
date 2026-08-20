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
    expect(apply).toContain('previewPatternApplication');
    expect(apply).not.toContain('향후 42일');
    expect(apply).not.toContain('42일 비교');
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
    expect(library).toContain("<Stack.Screen options={{ title: '근무 패턴 보관함' }} />");
    expect(library).not.toContain('<SectionHeader centered title="근무 패턴 보관함" />');
    expect(library).toContain('{!alreadyStored ? (');
    expect(library).not.toContain("label={alreadyStored ? '보관됨' : '검증본 보관'}");
  });

  it('fetches official patterns only from screen entry or the refresh action', () => {
    const library = appSource('pattern-library.tsx');
    expect(library).toContain("refreshOfficialPatterns('entry')");
    expect(library).toContain("refreshOfficialPatterns('manual')");
    expect(library).toContain('const [officialLoading, setOfficialLoading] = useState(false)');
    expect(library).not.toContain("setBusyOperation('official-fetch')");
    expect(library).not.toContain('setInterval(');
    expect(library).not.toContain('AppState');
  });

  it('keeps import, storage, preview, and application as separate actions', () => {
    const library = appSource('pattern-library.tsx');
    const apply = appSource('pattern-library-apply.tsx');
    expect(library).toContain('pickAndValidateShiftPatternFile');
    expect(library).toContain('importValidatedPattern');
    expect(library).not.toContain('applyPatternFromVault');
    expect(apply).toContain('previewPatternApplication');
    expect(apply).toContain('applyPatternFromVault');
    expect(apply).not.toContain('buildPatternDiffRows');
    expect(apply).not.toContain('pickAndValidateShiftPatternFile');
  });

  it('fails closed for invalid official integrity and connects history rollback', () => {
    const library = appSource('pattern-library.tsx');
    expect(library).toContain('사용자 패턴으로 바꾸어 열지 않았습니다');
    expect(library).toContain('rollbackLastPatternApplication');
    expect(library).toContain('data.patternHistory.slice(0, 10)');
  });

  it('routes applied vault patterns away from the base-only work pattern editor', () => {
    const patternEditor = appSource('pattern.tsx');
    expect(patternEditor).toContain("data.appliedPatternSource !== 'legacy'");
    expect(patternEditor).toContain("router.replace('/pattern-library'");
    expect(patternEditor).toContain('현재 근무표는 변경하지 않았습니다');
  });
});
