import { describe, expect, it, vi } from 'vitest';
import { createQuickTimerObservationSession } from './quick-timer-observation';

vi.mock('../../infrastructure/alarmpyo-native-module', () => ({
  getAlarmPyoNativeModule: () => null,
}));

// eslint-disable-next-line import/first
import {
  createQuickTimerController,
  type QuickTimerControllerPort,
  type QuickTimerStatus,
} from './quick-timer-controller';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createPort(): QuickTimerControllerPort {
  return {
    getStatus: vi.fn(async () => status('idle')),
    pause: vi.fn(async () => status('paused')),
    reset: vi.fn(async () => status('idle')),
    resume: vi.fn(async () => status('scheduled')),
    schedule: vi.fn(async () => status('scheduled')),
  };
}

function status(state: QuickTimerStatus['state']): QuickTimerStatus {
  return {
    active: state === 'scheduled',
    durationMinutes: state === 'idle' ? null : 30,
    fireAt: state === 'scheduled' ? 2 : 0,
    isRepeat: false,
    remainingMillis: state === 'idle' ? 0 : 60_000,
    requiredAction: 'none',
    startedAt: state === 'idle' ? 0 : 1,
    state,
    storageHealth: 'normal',
    supported: true,
  };
}

describe('빠른 타이머 controller', () => {
  it('화면 요청을 주입된 port에 그대로 전달합니다', async () => {
    const port = createPort();
    const controller = createQuickTimerController(port);

    expect(controller.durations).toEqual([15, 30, 45]);
    await expect(controller.getStatus()).resolves.toMatchObject({ state: 'idle' });
    await expect(controller.schedule(15)).resolves.toMatchObject({ state: 'scheduled' });
    await expect(controller.schedule(37)).resolves.toMatchObject({ state: 'scheduled' });
    await expect(controller.pause()).resolves.toMatchObject({ state: 'paused' });
    await expect(controller.resume()).resolves.toMatchObject({ state: 'scheduled' });
    await expect(controller.reset()).resolves.toMatchObject({ state: 'idle' });
    expect(port.schedule).toHaveBeenNthCalledWith(1, 15);
    expect(port.schedule).toHaveBeenNthCalledWith(2, 37);
  });

  it('조회·시작·일시정지·재개·초기화를 요청 순서대로 한 번씩 실행합니다', async () => {
    const firstRead = deferred<QuickTimerStatus>();
    const calls: string[] = [];
    const port: QuickTimerControllerPort = {
      getStatus: async () => { calls.push('read'); return firstRead.promise; },
      schedule: async () => { calls.push('schedule'); return status('scheduled'); },
      pause: async () => { calls.push('pause'); return status('paused'); },
      resume: async () => { calls.push('resume'); return status('scheduled'); },
      reset: async () => { calls.push('reset'); return status('idle'); },
    };
    const controller = createQuickTimerController(port);
    const results = [
      controller.getStatus(), controller.schedule(15), controller.pause(),
      controller.resume(), controller.reset(),
    ];
    await Promise.resolve();
    expect(calls).toEqual(['read']);
    firstRead.resolve(status('idle'));
    await Promise.all(results);
    expect(calls).toEqual(['read', 'schedule', 'pause', 'resume', 'reset']);
  });

  it('네이티브 오류 이후에도 다음 명령을 실행합니다', async () => {
    const port = createPort();
    vi.mocked(port.schedule).mockRejectedValueOnce(new Error('native unavailable'));
    const controller = createQuickTimerController(port);
    const failed = controller.schedule(15);
    const reset = controller.reset();
    await expect(failed).rejects.toThrow('native unavailable');
    await expect(reset).resolves.toMatchObject({ state: 'idle' });
    expect(port.reset).toHaveBeenCalledOnce();
  });

  it('느린 초기 조회 뒤 시작한 타이머 결과만 화면에 전달합니다', async () => {
    const read = deferred<QuickTimerStatus>();
    const port = createPort();
    vi.mocked(port.getStatus).mockReturnValueOnce(read.promise);
    const controller = createQuickTimerController(port);
    const session = createQuickTimerObservationSession();
    const published: string[] = [];
    session.activate();
    const readToken = session.beginObservation()!;
    const observed = controller.getStatus().then((result) => {
      if (session.isCurrent(readToken)) published.push(result.state);
    });
    const scheduleToken = session.claimAction()!;
    const scheduled = controller.schedule(30).then((result) => {
      if (session.isCurrent(scheduleToken)) published.push(result.state);
      session.releaseAction(scheduleToken);
    });
    read.resolve(status('idle'));
    await Promise.all([observed, scheduled]);
    expect(published).toEqual(['scheduled']);
  });

  it('재마운트 중인 이전 명령은 완료하되 결과·오류를 새 화면에 게시하지 않습니다', async () => {
    const schedule = deferred<QuickTimerStatus>();
    const port = createPort();
    vi.mocked(port.schedule).mockReturnValueOnce(schedule.promise);
    vi.mocked(port.getStatus).mockResolvedValue(status('scheduled'));
    const controller = createQuickTimerController(port);
    const session = createQuickTimerObservationSession();
    const published: string[] = [];
    session.activate();
    const oldToken = session.claimAction()!;
    const oldCommand = controller.schedule(30).then((result) => {
      if (session.isCurrent(oldToken)) published.push(`old:${result.state}`);
      session.releaseAction(oldToken);
    });
    session.deactivate();
    session.activate();
    const newToken = session.beginObservation()!;
    const newRead = controller.getStatus().then((result) => {
      if (session.isCurrent(newToken)) published.push(`new:${result.state}`);
    });
    schedule.resolve(status('scheduled'));
    await Promise.all([oldCommand, newRead]);
    expect(published).toEqual(['new:scheduled']);
    expect(port.schedule).toHaveBeenCalledOnce();
  });

  it('탭을 떠난 뒤 실패한 명령을 낭독하지 않고 복귀 조회를 실행합니다', async () => {
    const paused = deferred<QuickTimerStatus>();
    const port = createPort();
    vi.mocked(port.pause).mockReturnValueOnce(paused.promise);
    vi.mocked(port.getStatus).mockResolvedValue(status('scheduled'));
    const controller = createQuickTimerController(port);
    const session = createQuickTimerObservationSession();
    const announcements: string[] = [];
    session.activate();
    const oldToken = session.claimAction()!;
    const oldCommand = controller.pause().catch(() => {
      if (session.isCurrent(oldToken)) announcements.push('일시정지 실패');
    }).finally(() => session.releaseAction(oldToken));
    session.deactivate();
    paused.reject(new Error('pause failed'));
    await oldCommand;
    expect(announcements).toEqual([]);
    session.activate();
    const newToken = session.beginObservation()!;
    const current = await controller.getStatus();
    expect(session.isCurrent(newToken)).toBe(true);
    expect(current.state).toBe('scheduled');
    expect(session.hasPendingAction()).toBe(false);
  });
});
