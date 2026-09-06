import { describe, expect, it } from 'vitest';

import { createQuickTimerObservationSession } from './quick-timer-observation';

describe('타이머 화면 관측 세대', () => {
  it('effect setup → cleanup → setup 이후 새 결과만 게시합니다', () => {
    const session = createQuickTimerObservationSession();
    expect(session.beginObservation()).toBeNull();
    session.activate();
    const firstMount = session.beginObservation()!;
    session.deactivate();
    expect(session.isCurrent(firstMount)).toBe(false);
    session.activate();
    const secondMount = session.beginObservation()!;
    expect(session.isCurrent(firstMount)).toBe(false);
    expect(session.isCurrent(secondMount)).toBe(true);
  });

  it('먼저 시작한 조회보다 새 타이머 명령 결과를 우선합니다', () => {
    const session = createQuickTimerObservationSession();
    session.activate();
    const read = session.beginObservation()!;
    const schedule = session.claimAction()!;
    expect(session.isCurrent(read)).toBe(false);
    expect(session.isCurrent(schedule)).toBe(true);
    expect(session.beginObservation()).toBeNull();
    expect(session.claimAction()).toBeNull();
    expect(session.releaseAction(schedule)).toBe(true);
    expect(session.hasPendingAction()).toBe(false);
    expect(session.beginObservation()).not.toBeNull();
  });

  it('빠른 연속 누름을 한 명령으로 제한하고 일시정지·재개·초기화를 다시 받습니다', () => {
    const session = createQuickTimerObservationSession();
    session.activate();
    for (const command of ['schedule', 'pause', 'resume', 'reset']) {
      const token = session.claimAction()!;
      expect(token, command).not.toBeNull();
      expect(session.claimAction(), command).toBeNull();
      expect(session.releaseAction(token), command).toBe(true);
      expect(session.releaseAction(token), command).toBe(false);
    }
  });

  it('이전 화면의 명령 종료가 재진입 화면의 명령 잠금을 풀지 않습니다', () => {
    const session = createQuickTimerObservationSession();
    session.activate();
    const oldCommand = session.claimAction()!;
    session.deactivate();
    session.activate();
    const newCommand = session.claimAction()!;
    expect(session.releaseAction(oldCommand)).toBe(false);
    expect(session.hasPendingAction()).toBe(true);
    expect(session.isCurrent(newCommand)).toBe(true);
    expect(session.releaseAction(newCommand)).toBe(true);
  });

  it('재시도 조회는 자신이 획득한 명령 revision에서만 실행됩니다', () => {
    const session = createQuickTimerObservationSession();
    session.activate();
    const retry = session.claimAction()!;
    expect(session.beginObservation(retry)).toBe(retry);
    session.releaseAction(retry);
    const reset = session.claimAction()!;
    expect(session.beginObservation(retry)).toBeNull();
    expect(session.beginObservation(reset)).toBe(reset);
  });

  it('겹친 resume 관측은 마지막 조회만 게시하고 닫힌 화면에는 게시하지 않습니다', () => {
    const session = createQuickTimerObservationSession();
    session.activate();
    const earlier = session.beginObservation()!;
    const latest = session.beginObservation()!;
    expect(session.isCurrent(earlier)).toBe(false);
    expect(session.isCurrent(latest)).toBe(true);
    session.deactivate();
    expect(session.isCurrent(latest)).toBe(false);
    expect(session.claimAction()).toBeNull();
  });
});
