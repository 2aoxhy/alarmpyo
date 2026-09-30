import * as FileSystem from 'expo-file-system/legacy';
import { File, FileMode } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef, releaseCapture, type ViewShotRef } from 'react-native-view-shot';

import {
  CALENDAR_IMAGE_PIXEL_HEIGHT,
  CALENDAR_IMAGE_PIXEL_WIDTH,
  createCalendarImageFileName,
  type CalendarImageShareSnapshot,
} from './calendar-image-share-model';

const CALENDAR_IMAGE_EXPORT_PATTERN = /^\d{4}-\d{2}-근무표\.png$/u;
const PNG_HEADER_BYTE_LENGTH = 24;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PNG_IHDR_CHUNK_TYPE = [0x49, 0x48, 0x44, 0x52] as const;
export const MAX_CALENDAR_IMAGE_BYTES = 8 * 1024 * 1024;

export type CalendarImageShareResult = Readonly<{
  fileName: string;
  status: 'chooser-closed' | 'stale';
  storageStatus: 'unconfirmed';
}>;

export type CalendarImageShareControllerErrorReason =
  | 'busy'
  | 'capture-failed'
  | 'sharing-unavailable'
  | 'storage-unavailable';

export class CalendarImageShareControllerError extends Error {
  constructor(
    readonly reason: CalendarImageShareControllerErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'CalendarImageShareControllerError';
  }
}

export type CalendarImageShareControllerDependencies = Readonly<{
  cacheDirectory: string | null;
  capture: (target: React.RefObject<ViewShotRef | null>) => Promise<string>;
  copy: (from: string, to: string) => Promise<void>;
  delete: (uri: string) => Promise<void>;
  getFileInfo: (uri: string) => Promise<{ exists: boolean; size?: number } | null>;
  listCache: () => Promise<readonly string[]>;
  readFileHeader: (uri: string, byteLength: number) => Promise<Uint8Array>;
  releaseCapture: (uri: string) => void;
  share: (uri: string) => Promise<void>;
  sharingAvailable: () => Promise<boolean>;
}>;

function createDefaultDependencies(): CalendarImageShareControllerDependencies {
  return {
    cacheDirectory: FileSystem.cacheDirectory,
    capture: (target) =>
      captureRef(target, {
        format: 'png',
        height: CALENDAR_IMAGE_PIXEL_HEIGHT,
        quality: 1,
        result: 'tmpfile',
        width: CALENDAR_IMAGE_PIXEL_WIDTH,
      }),
    copy: (from, to) => FileSystem.copyAsync({ from, to }),
    delete: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
    getFileInfo: (uri) => FileSystem.getInfoAsync(uri).catch(() => null),
    listCache: () =>
      FileSystem.cacheDirectory
        ? FileSystem.readDirectoryAsync(FileSystem.cacheDirectory)
        : Promise.resolve([]),
    readFileHeader: async (uri, byteLength) => {
      const handle = new File(uri).open(FileMode.ReadOnly);
      try {
        return handle.readBytes(byteLength);
      } finally {
        handle.close();
      }
    },
    releaseCapture,
    share: (uri) =>
      Sharing.shareAsync(uri, {
        dialogTitle: '근무표 이미지 공유',
        mimeType: 'image/png',
        UTI: 'public.png',
      }),
    sharingAvailable: () => Sharing.isAvailableAsync(),
  };
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function hasBytesAt(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function isExpectedCalendarPngHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_HEADER_BYTE_LENGTH) return false;
  return (
    hasBytesAt(bytes, 0, PNG_SIGNATURE) &&
    readUint32BigEndian(bytes, 8) === 13 &&
    hasBytesAt(bytes, 12, PNG_IHDR_CHUNK_TYPE) &&
    readUint32BigEndian(bytes, 16) === CALENDAR_IMAGE_PIXEL_WIDTH &&
    readUint32BigEndian(bytes, 20) === CALENDAR_IMAGE_PIXEL_HEIGHT
  );
}

async function cleanupPreviousExports(
  dependencies: CalendarImageShareControllerDependencies,
): Promise<void> {
  const cacheDirectory = dependencies.cacheDirectory;
  if (!cacheDirectory) return;
  try {
    const files = await dependencies.listCache();
    await Promise.all(
      files
        .filter((fileName) => CALENDAR_IMAGE_EXPORT_PATTERN.test(fileName))
        .map((fileName) => dependencies.delete(`${cacheDirectory}${fileName}`)),
    );
  } catch {
    throw new CalendarImageShareControllerError(
      'storage-unavailable',
      '이전 공유 이미지를 정리하지 못했습니다.',
    );
  }
}

export function createCalendarImageShareController(
  dependencies: CalendarImageShareControllerDependencies = createDefaultDependencies(),
) {
  let active = false;
  let revision = 0;

  return {
    invalidate() {
      revision += 1;
    },

    isBusy() {
      return active;
    },

    async share(
      snapshot: CalendarImageShareSnapshot,
      target: React.RefObject<ViewShotRef | null>,
    ): Promise<CalendarImageShareResult> {
      if (active) {
        throw new CalendarImageShareControllerError(
          'busy',
          '근무표 이미지를 만드는 중입니다.',
        );
      }
      const requestRevision = ++revision;
      const fileName = createCalendarImageFileName(snapshot);
      let destinationUri: string | null = null;
      let destinationTouched = false;
      let captureUri: string | null = null;
      active = true;

      try {
        if (!dependencies.cacheDirectory) {
          throw new CalendarImageShareControllerError(
            'storage-unavailable',
            '공유 이미지를 만들 저장 공간이 없습니다.',
          );
        }
        if (!(await dependencies.sharingAvailable())) {
          throw new CalendarImageShareControllerError(
            'sharing-unavailable',
            '이 휴대폰에서는 이미지 공유를 사용할 수 없습니다.',
          );
        }
        if (!target.current) {
          throw new CalendarImageShareControllerError(
            'capture-failed',
            '공유 이미지를 준비하지 못했습니다.',
          );
        }
        destinationUri = `${dependencies.cacheDirectory}${fileName}`;
        await cleanupPreviousExports(dependencies);
        if (requestRevision !== revision) {
          return { fileName, status: 'stale', storageStatus: 'unconfirmed' };
        }

        captureUri = await dependencies.capture(target);
        if (requestRevision !== revision) {
          return { fileName, status: 'stale', storageStatus: 'unconfirmed' };
        }

        destinationTouched = true;
        await dependencies.copy(captureUri, destinationUri);
        const fileInfo = await dependencies.getFileInfo(destinationUri);
        if (
          !fileInfo?.exists ||
          typeof fileInfo.size !== 'number' ||
          fileInfo.size <= 0 ||
          fileInfo.size > MAX_CALENDAR_IMAGE_BYTES
        ) {
          throw new CalendarImageShareControllerError(
            'capture-failed',
            '공유 이미지를 정확히 만들지 못했습니다.',
          );
        }
        const fileHeader = await dependencies.readFileHeader(
          destinationUri,
          PNG_HEADER_BYTE_LENGTH,
        );
        if (!isExpectedCalendarPngHeader(fileHeader)) {
          throw new CalendarImageShareControllerError(
            'capture-failed',
            '공유 이미지를 정확히 만들지 못했습니다.',
          );
        }
        if (requestRevision !== revision) {
          await dependencies.delete(destinationUri);
          return { fileName, status: 'stale', storageStatus: 'unconfirmed' };
        }

        await dependencies.share(destinationUri);
        if (requestRevision !== revision) {
          await dependencies.delete(destinationUri);
          return { fileName, status: 'stale', storageStatus: 'unconfirmed' };
        }

        return {
          fileName,
          status: 'chooser-closed',
          storageStatus: 'unconfirmed',
        };
      } catch (error) {
        if (destinationUri && destinationTouched) {
          try {
            await dependencies.delete(destinationUri);
          } catch {
            throw new CalendarImageShareControllerError(
              'storage-unavailable',
              '공유 이미지 파일을 정리하지 못했습니다.',
            );
          }
        }
        if (error instanceof CalendarImageShareControllerError) throw error;
        throw new CalendarImageShareControllerError(
          'capture-failed',
          '근무표 이미지를 공유하지 못했습니다.',
        );
      } finally {
        if (captureUri) dependencies.releaseCapture(captureUri);
        active = false;
      }
    },
  };
}

export type CalendarImageShareController = ReturnType<
  typeof createCalendarImageShareController
>;
