import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultAppData, previewAppDataImport } from '../app-data-service';
import { writeDeviceSafetyBackup } from '../device-safety-backup-service';

const inMemoryFileSystem = vi.hoisted(() => {
  const files = new Map<string, string>();

  class Directory {
    readonly uri: string;

    constructor(...parts: (string | Directory)[]) {
      this.uri = parts
        .map((part) => typeof part === 'string' ? part : part.uri)
        .join('/');
    }

    create() {}
  }

  class File {
    readonly uri: string;

    constructor(directory: Directory, name: string) {
      this.uri = `${directory.uri}/${name}`;
    }

    get exists() {
      return files.has(this.uri);
    }

    create(options?: { overwrite?: boolean }) {
      if (this.exists && !options?.overwrite) throw new Error('already exists');
      files.set(this.uri, '');
    }

    delete() {
      files.delete(this.uri);
    }

    write(contents: string) {
      files.set(this.uri, contents);
    }

    async text() {
      const contents = files.get(this.uri);
      if (contents === undefined) throw new Error('missing file');
      return contents;
    }

    async copy(destination: File) {
      destination.write(await this.text());
    }

    async move(destination: File) {
      destination.write(await this.text());
      this.delete();
    }
  }

  return {
    Directory,
    File,
    Paths: { document: 'documents' },
    files,
  };
});

vi.mock('expo-file-system', () => ({
  Directory: inMemoryFileSystem.Directory,
  File: inMemoryFileSystem.File,
  Paths: inMemoryFileSystem.Paths,
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

const latestPath = 'documents/alarmpyo-safety-backups/latest.alarmpyo-backup.json';
const previousPath = 'documents/alarmpyo-safety-backups/previous.alarmpyo-backup.json';

function readNote(path: string) {
  const raw = inMemoryFileSystem.files.get(path);
  if (raw === undefined) throw new Error(`missing backup: ${path}`);
  return previewAppDataImport(raw).data.notes['2026-08-12'];
}

describe('기기 안전 백업 쓰기', () => {
  beforeEach(() => {
    inMemoryFileSystem.files.clear();
  });

  it('A → B → B 재저장에서도 previous=A를 보존해요', async () => {
    const a = createDefaultAppData('2026-08-12');
    a.notes['2026-08-12'] = 'A';
    const b = {
      ...a,
      notes: { ...a.notes, '2026-08-12': 'B' },
    };

    await writeDeviceSafetyBackup(a, new Date('2026-08-12T00:00:00.000Z'));
    await writeDeviceSafetyBackup(b, new Date('2026-08-12T00:01:00.000Z'));
    const latestBeforeRetry = inMemoryFileSystem.files.get(latestPath);
    const bAfterAlarmSync = {
      ...b,
      settings: {
        ...b.settings,
        scheduledNotificationCount: 3,
        lastNotificationSyncAt: '2026-08-12T00:01:30.000Z',
      },
    };

    await writeDeviceSafetyBackup(
      bAfterAlarmSync,
      new Date('2026-08-12T00:02:00.000Z'),
    );

    expect(readNote(latestPath)).toBe('B');
    expect(readNote(previousPath)).toBe('A');
    expect(inMemoryFileSystem.files.get(latestPath)).toBe(latestBeforeRetry);
  });

  it('latest가 손상됐을 때 정상 previous를 손상본으로 덮어쓰지 않아요', async () => {
    const a = createDefaultAppData('2026-08-12');
    a.notes['2026-08-12'] = 'A';
    const b = {
      ...a,
      notes: { ...a.notes, '2026-08-12': 'B' },
    };
    const c = {
      ...a,
      notes: { ...a.notes, '2026-08-12': 'C' },
    };

    await writeDeviceSafetyBackup(a);
    await writeDeviceSafetyBackup(b);
    inMemoryFileSystem.files.set(latestPath, '{corrupt');

    await writeDeviceSafetyBackup(c);

    expect(readNote(latestPath)).toBe('C');
    expect(readNote(previousPath)).toBe('A');
  });
});
