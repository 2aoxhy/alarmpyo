import { describe, expect, it } from 'vitest';

import { updateAppDialogPriorityOwners } from './app-dialog-priority';

describe('앱 대화상자 우선순위 조정', () => {
  it('우선 모달이 닫힐 때까지 기존 대화상자를 숨길 상태를 유지합니다', () => {
    const empty = new Set<string>();
    const playUpdate = updateAppDialogPriorityOwners(
      empty,
      'play-update',
      true,
    );
    const withRecovery = updateAppDialogPriorityOwners(
      playUpdate,
      'recovery',
      true,
    );
    const afterPlayUpdate = updateAppDialogPriorityOwners(
      withRecovery,
      'play-update',
      false,
    );

    expect(playUpdate).not.toBe(empty);
    expect(withRecovery.size).toBe(2);
    expect(afterPlayUpdate.has('recovery')).toBe(true);
    expect(afterPlayUpdate.size).toBe(1);
  });

  it('같은 상태의 중복 알림은 새 상태를 만들지 않습니다', () => {
    const current = new Set(['play-update']);

    expect(
      updateAppDialogPriorityOwners(current, 'play-update', true),
    ).toBe(current);
  });
});
