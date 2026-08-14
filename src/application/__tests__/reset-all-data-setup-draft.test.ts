import { describe, expect, it } from 'vitest';

// @ts-expect-error Vitest raw import is used to verify provider sequencing.
import providerSource from '../../store/app-store.tsx?raw';

describe('전체 데이터 초기화의 후속 정리', () => {
  it('정리 저널을 본문보다 먼저 쓰고 본문 저장 뒤 상태 적용 전에 완료해요', () => {
    const replacementStart = providerSource.indexOf(
      'const replaceDataAndPersistDetailedInternal',
    );
    const resetStart = providerSource.indexOf('const resetAllDataDetailed');
    const replacementSource = providerSource.slice(replacementStart, resetStart);
    const prepareJournal = replacementSource.indexOf(
      'await beforePrimarySave(snapshot);',
    );
    const persist = replacementSource.indexOf(
      'const persisted = await persistSnapshot',
    );
    const primarySaved = replacementSource.indexOf('if (!persisted.primarySaved)');
    const resumeJournal = replacementSource.indexOf(
      'await afterPrimarySaveBeforeApply(snapshot);',
    );
    const applyData = replacementSource.indexOf('const dataApplied = updateData');

    expect(prepareJournal).toBeGreaterThanOrEqual(0);
    expect(persist).toBeGreaterThan(prepareJournal);
    expect(primarySaved).toBeGreaterThan(persist);
    expect(resumeJournal).toBeGreaterThan(primarySaved);
    expect(applyData).toBeGreaterThan(resumeJournal);
    expect(replacementSource).toContain(
      'preApplyFollowUpSucceeded &&\n          persistenceFollowUpSucceeded',
    );
    expect(providerSource.slice(resetStart)).toContain(
      'prepareResetCleanupJournal(snapshot)',
    );
    expect(providerSource.slice(resetStart)).toContain(
      'resumeResetCleanupJournal({',
    );
    expect(providerSource.slice(resetStart)).toContain(
      'clearResetCleanupJournal().catch',
    );
  });

  it('앱 시작 때 초기화 정리 저널을 재개한 뒤 ready를 열어요', () => {
    const loadStart = providerSource.indexOf('const loadData = useCallback');
    const updateStart = providerSource.indexOf('const updateData = useCallback');
    const loadSource = providerSource.slice(loadStart, updateStart);
    const resume = loadSource.indexOf('await resumeResetCleanupJournal({');
    const ready = loadSource.indexOf('readyRef.current = true;');

    expect(resume).toBeGreaterThanOrEqual(0);
    expect(ready).toBeGreaterThan(resume);
    expect(loadSource).toContain("result.source === 'reset'");
    expect(loadSource).toContain("'reset-marker-cleanup-failed'");
  });
});
