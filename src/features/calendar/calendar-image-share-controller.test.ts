import { createRef } from 'react';
import type { ViewShotRef } from 'react-native-view-shot';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCalendarImageShareController,
  type CalendarImageShareControllerDependencies,
  CalendarImageShareControllerError,
  MAX_CALENDAR_IMAGE_BYTES,
} from './calendar-image-share-controller';
import type { CalendarImageShareSnapshot } from './calendar-image-share-model';

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'cache://',
  copyAsync: vi.fn(),
  deleteAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
}));
vi.mock('expo-file-system', () => ({
  File: vi.fn(),
  FileMode: { ReadOnly: 'r' },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));
vi.mock('react-native-view-shot', () => ({
  captureRef: vi.fn(),
  releaseCapture: vi.fn(),
}));

const snapshot: CalendarImageShareSnapshot = {
  automaticScheduleVisible: true,
  holidayDataComplete: true,
  month: 7,
  weeks: [],
  year: 2026,
};

function createTarget() {
  const target = createRef<ViewShotRef>();
  target.current = {} as ViewShotRef;
  return target;
}

function createPngHeader(width = 1080, height = 1350): Uint8Array {
  const header = new Uint8Array(24);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  header.set([0, 0, 0, 13], 8);
  header.set([0x49, 0x48, 0x44, 0x52], 12);
  header.set(
    [(width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff],
    16,
  );
  header.set(
    [
      (height >>> 24) & 0xff,
      (height >>> 16) & 0xff,
      (height >>> 8) & 0xff,
      height & 0xff,
    ],
    20,
  );
  return header;
}

function createDependencies(): CalendarImageShareControllerDependencies {
  return {
    cacheDirectory: 'cache://',
    capture: vi.fn().mockResolvedValue('tmp://capture.png'),
    copy: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getFileInfo: vi.fn().mockResolvedValue({ exists: true, size: 1024 }),
    listCache: vi.fn().mockResolvedValue(['2026-07-근무표.png', 'keep.txt']),
    readFileHeader: vi.fn().mockResolvedValue(createPngHeader()),
    releaseCapture: vi.fn(),
    share: vi.fn().mockResolvedValue(undefined),
    sharingAvailable: vi.fn().mockResolvedValue(true),
  };
}

function createDeferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

describe('달력 이미지 공유 controller', () => {
  let dependencies: CalendarImageShareControllerDependencies;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  it('기존 임시 이미지를 정리하고 고정 파일명 PNG를 공유합니다', async () => {
    const controller = createCalendarImageShareController(dependencies);

    await expect(controller.share(snapshot, createTarget())).resolves.toEqual({
      fileName: '2026-08-근무표.png',
      status: 'chooser-closed',
      storageStatus: 'unconfirmed',
    });
    expect(dependencies.delete).toHaveBeenCalledWith('cache://2026-07-근무표.png');
    expect(dependencies.copy).toHaveBeenCalledWith(
      'tmp://capture.png',
      'cache://2026-08-근무표.png',
    );
    expect(dependencies.readFileHeader).toHaveBeenCalledWith(
      'cache://2026-08-근무표.png',
      24,
    );
    expect(dependencies.share).toHaveBeenCalledWith('cache://2026-08-근무표.png');
    expect(dependencies.releaseCapture).toHaveBeenCalledWith('tmp://capture.png');
    expect(controller.isBusy()).toBe(false);
  });

  it('PNG 서명이 잘못된 결과 파일은 삭제하고 공유하지 않습니다', async () => {
    const invalidHeader = createPngHeader();
    invalidHeader[0] = 0;
    vi.mocked(dependencies.readFileHeader).mockResolvedValue(invalidHeader);
    const controller = createCalendarImageShareController(dependencies);

    await expect(controller.share(snapshot, createTarget())).rejects.toEqual(
      expect.objectContaining<Partial<CalendarImageShareControllerError>>({
        reason: 'capture-failed',
      }),
    );
    expect(dependencies.delete).toHaveBeenCalledWith('cache://2026-08-근무표.png');
    expect(dependencies.share).not.toHaveBeenCalled();
  });

  it.each([
    ['너비', 1079, 1350],
    ['높이', 1080, 1349],
  ])('PNG %s가 고정 크기와 다르면 삭제하고 공유하지 않습니다', async (_label, width, height) => {
    vi.mocked(dependencies.readFileHeader).mockResolvedValue(
      createPngHeader(width, height),
    );
    const controller = createCalendarImageShareController(dependencies);

    await expect(controller.share(snapshot, createTarget())).rejects.toEqual(
      expect.objectContaining<Partial<CalendarImageShareControllerError>>({
        reason: 'capture-failed',
      }),
    );
    expect(dependencies.delete).toHaveBeenCalledWith('cache://2026-08-근무표.png');
    expect(dependencies.share).not.toHaveBeenCalled();
  });

  it('PNG 헤더를 읽지 못하면 캡처 오류로 변환하고 결과 파일을 정리합니다', async () => {
    vi.mocked(dependencies.readFileHeader).mockRejectedValue(new Error('읽기 실패'));
    const controller = createCalendarImageShareController(dependencies);

    await expect(controller.share(snapshot, createTarget())).rejects.toEqual(
      expect.objectContaining<Partial<CalendarImageShareControllerError>>({
        reason: 'capture-failed',
      }),
    );
    expect(dependencies.delete).toHaveBeenCalledWith('cache://2026-08-근무표.png');
    expect(dependencies.share).not.toHaveBeenCalled();
  });

  it('동시에 두 번 실행하지 않습니다', async () => {
    const availability = createDeferred<boolean>();
    vi.mocked(dependencies.sharingAvailable).mockReturnValue(availability.promise);
    const controller = createCalendarImageShareController(dependencies);
    const first = controller.share(snapshot, createTarget());

    await expect(controller.share(snapshot, createTarget())).rejects.toEqual(
      expect.objectContaining<Partial<CalendarImageShareControllerError>>({ reason: 'busy' }),
    );
    availability.settle(false);
    await expect(first).rejects.toEqual(
      expect.objectContaining<Partial<CalendarImageShareControllerError>>({
        reason: 'sharing-unavailable',
      }),
    );
    expect(controller.isBusy()).toBe(false);
  });

  it('화면이 사라져 revision이 바뀌면 오래된 캡처 결과를 공유하지 않습니다', async () => {
    const capture = createDeferred<string>();
    vi.mocked(dependencies.capture).mockReturnValue(capture.promise);
    const controller = createCalendarImageShareController(dependencies);
    const pending = controller.share(snapshot, createTarget());
    await vi.waitFor(() => expect(dependencies.capture).toHaveBeenCalledOnce());

    controller.invalidate();
    capture.settle('tmp://stale.png');

    await expect(pending).resolves.toMatchObject({ status: 'stale' });
    expect(dependencies.copy).not.toHaveBeenCalled();
    expect(dependencies.share).not.toHaveBeenCalled();
    expect(dependencies.releaseCapture).toHaveBeenCalledWith('tmp://stale.png');
  });

  it('비어 있거나 8MB를 넘는 결과 파일은 삭제하고 공유하지 않습니다', async () => {
    vi.mocked(dependencies.getFileInfo).mockResolvedValue({
      exists: true,
      size: MAX_CALENDAR_IMAGE_BYTES + 1,
    });
    const controller = createCalendarImageShareController(dependencies);

    await expect(controller.share(snapshot, createTarget())).rejects.toEqual(
      expect.objectContaining<Partial<CalendarImageShareControllerError>>({
        reason: 'capture-failed',
      }),
    );
    expect(dependencies.delete).toHaveBeenCalledWith('cache://2026-08-근무표.png');
    expect(dependencies.share).not.toHaveBeenCalled();
  });

  it('공유 실패 파일을 정리합니다', async () => {
    vi.mocked(dependencies.share).mockRejectedValue(new Error('실패'));
    const controller = createCalendarImageShareController(dependencies);

    await expect(controller.share(snapshot, createTarget())).rejects.toEqual(
      expect.objectContaining<Partial<CalendarImageShareControllerError>>({
        reason: 'capture-failed',
      }),
    );
    expect(dependencies.delete).toHaveBeenCalledWith('cache://2026-08-근무표.png');
  });

  it('이전 이미지 목록을 읽지 못하면 새 이미지를 만들지 않습니다', async () => {
    vi.mocked(dependencies.listCache).mockRejectedValue(new Error('목록 실패'));
    const controller = createCalendarImageShareController(dependencies);

    await expect(controller.share(snapshot, createTarget())).rejects.toEqual(
      expect.objectContaining<Partial<CalendarImageShareControllerError>>({
        reason: 'storage-unavailable',
      }),
    );
    expect(dependencies.capture).not.toHaveBeenCalled();
    expect(dependencies.copy).not.toHaveBeenCalled();
  });

  it('이전 이미지 삭제에 실패하면 새 이미지를 만들지 않습니다', async () => {
    vi.mocked(dependencies.delete).mockRejectedValueOnce(new Error('삭제 실패'));
    const controller = createCalendarImageShareController(dependencies);

    await expect(controller.share(snapshot, createTarget())).rejects.toEqual(
      expect.objectContaining<Partial<CalendarImageShareControllerError>>({
        reason: 'storage-unavailable',
      }),
    );
    expect(dependencies.capture).not.toHaveBeenCalled();
    expect(dependencies.copy).not.toHaveBeenCalled();
  });
});
