import { describe, expect, it } from 'vitest';

// @ts-expect-error Vitest raw import is used to verify provider sequencing.
import providerSource from '../../store/app-store.tsx?raw';

import { clearSetupDraftBeforeApplyingReset } from '../app-store-persistence';

describe('전체 데이터 초기화의 설정 초안 정리', () => {
  it('설정 초안을 지우면 완료해요', async () => {
    const events: string[] = [];

    await expect(
      clearSetupDraftBeforeApplyingReset(async () => {
        events.push('draft:clear');
      }),
    ).resolves.toBeUndefined();
    expect(events).toEqual(['draft:clear']);
  });

  it('설정 초안 삭제 실패를 후속 처리 실패로 전달해요', async () => {
    await expect(
      clearSetupDraftBeforeApplyingReset(async () => {
        throw new Error('remove failed');
      }),
    ).rejects.toThrow('초기 설정 임시 저장을 지우지 못했어요');
  });

  it('본문 저장 뒤, 초기화 상태를 적용하기 전에 설정 초안을 정리해요', () => {
    const replacementStart = providerSource.indexOf(
      'const replaceDataAndPersistDetailedInternal',
    );
    const resetStart = providerSource.indexOf('const resetAllDataDetailed');
    const replacementSource = providerSource.slice(replacementStart, resetStart);
    const primarySaved = replacementSource.indexOf('if (!persisted.primarySaved)');
    const clearDraft = replacementSource.indexOf(
      'await afterPrimarySaveBeforeApply();',
    );
    const applyData = replacementSource.indexOf('const dataApplied = updateData');

    expect(primarySaved).toBeGreaterThanOrEqual(0);
    expect(clearDraft).toBeGreaterThan(primarySaved);
    expect(applyData).toBeGreaterThan(clearDraft);
    expect(replacementSource).toContain(
      'preApplyFollowUpSucceeded &&\n          persistenceFollowUpSucceeded',
    );
    expect(providerSource.slice(resetStart)).toContain(
      'clearSetupDraftBeforeApplyingReset(clearSetupDraft)',
    );
  });
});
