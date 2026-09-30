import { describe, expect, it } from 'vitest';

import { coordinatorSources, operationSource } from './store-coordinator-source';

describe('전체 데이터 초기화의 후속 정리', () => {
  it('정리 저널을 본문보다 먼저 쓰고 본문 저장 뒤 상태 적용 전에 완료해요', () => {
    const replacementSource = operationSource(coordinatorSources.persistence, 'replaceDataAndPersistDetailedInternal');
    const resetSource = operationSource(coordinatorSources.restore, 'resetAllDataDetailed');
    const prepareJournal = replacementSource.indexOf(
      'await beforePrimarySave(snapshot);',
    );
    const persist = replacementSource.indexOf(
      'const persisted = await operations.persistSnapshot',
    );
    const primarySaved = replacementSource.indexOf('if (!persisted.primarySaved)');
    const resumeJournal = replacementSource.indexOf(
      'await afterPrimarySaveBeforeApply(snapshot);',
    );
    const applyData = replacementSource.indexOf('const dataApplied =');

    expect(prepareJournal).toBeGreaterThanOrEqual(0);
    expect(persist).toBeGreaterThan(prepareJournal);
    expect(primarySaved).toBeGreaterThan(persist);
    expect(resumeJournal).toBeGreaterThan(primarySaved);
    expect(applyData).toBeGreaterThan(resumeJournal);
    expect(replacementSource).toMatch(/preApplyFollowUpSucceeded\s*&&\s*persistenceFollowUpSucceeded/);
    expect(resetSource).toContain(
      'prepareResetCleanupJournal(snapshot)',
    );
    expect(resetSource).toContain(
      'resumeResetCleanupJournal({',
    );
    expect(resetSource).toContain(
      'clearResetCleanupJournal().catch',
    );
  });

  it('앱 시작 때 초기화 정리 저널을 재개한 뒤 ready를 열어요', () => {
    const loadSource = operationSource(coordinatorSources.boot, 'loadData');
    const resume = loadSource.indexOf('await context.platform.resumeResetCleanupJournal({');
    const ready = loadSource.indexOf('readyRef.current = true;');

    expect(resume).toBeGreaterThanOrEqual(0);
    expect(ready).toBeGreaterThan(resume);
    expect(loadSource).toContain("result.source === 'reset'");
    expect(loadSource).toContain("'reset-marker-cleanup-failed'");
  });
});
