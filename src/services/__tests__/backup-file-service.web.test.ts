import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportBackupFile, pickBackupFile } from '../backup-file-service.web';

const getDocumentAsync = vi.hoisted(() => vi.fn());

vi.mock('expo-document-picker', () => ({ getDocumentAsync }));

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
const originalUrl = globalThis.URL;

beforeEach(() => {
  getDocumentAsync.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.stubGlobal('document', originalDocument);
  vi.stubGlobal('fetch', originalFetch);
  vi.stubGlobal('URL', originalUrl);
});

describe('웹 백업 파일 처리', () => {
  it('브라우저가 다운로드를 시작한 다음 객체 URL을 정리해요', async () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:alarmpyo-backup');
    const revokeObjectURL = vi.fn();
    const link = { click, download: '', href: '', remove };

    vi.stubGlobal('document', {
      body: { appendChild },
      createElement: vi.fn(() => link),
    });
    const TestURL = class extends originalUrl {};
    TestURL.createObjectURL = createObjectURL;
    TestURL.revokeObjectURL = revokeObjectURL;
    vi.stubGlobal('URL', TestURL);

    await expect(exportBackupFile('{"ok":true}')).resolves.toEqual({
      fileName: expect.stringMatching(/^AlarmPyo-백업-/),
      storageStatus: 'unconfirmed',
    });

    expect(appendChild).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:alarmpyo-backup');
  });

  it('암호화 백업은 브라우저에서도 전용 확장자로 저장해요', async () => {
    const click = vi.fn();
    const link = { click, download: '', href: '', remove: vi.fn() };
    vi.stubGlobal('document', {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => link),
    });
    const TestURL = class extends originalUrl {};
    TestURL.createObjectURL = vi.fn(() => 'blob:encrypted-backup');
    TestURL.revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', TestURL);

    await expect(
      exportBackupFile('{"encrypted":true}', { encrypted: true }),
    ).resolves.toEqual({
      fileName: expect.stringMatching(/^AlarmPyo-암호화-백업-.*\.alarmpyo$/),
      storageStatus: 'unconfirmed',
    });
    expect(link.download).toMatch(/\.alarmpyo$/);
    expect(click).toHaveBeenCalledOnce();
  });

  it('파일 선택기가 크기를 알려주지 않아도 실제 6MB 초과 파일을 읽기 전에 거절해요', async () => {
    const text = vi.fn();
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: '큰-백업.json', uri: 'blob:large-backup' }],
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => ({
        size: 6 * 1024 * 1024 + 1,
        text,
      }),
    })));

    await expect(pickBackupFile()).rejects.toThrow('6MB 이하여야 해요');
    expect(text).not.toHaveBeenCalled();
  });

  it('문서 공급자의 크기보다 실제 브라우저 파일 크기를 우선 확인해요', async () => {
    const text = vi.fn();
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{
        file: { size: 6 * 1024 * 1024 + 1, text },
        name: '큰-백업.json',
        size: 1,
        uri: 'blob:large-file',
      }],
    });

    await expect(pickBackupFile()).rejects.toThrow('6MB 이하여야 해요');
    expect(text).not.toHaveBeenCalled();
  });

  it('.alarmpyo로 잘못 이름 붙인 평문 백업도 웹에서 평문으로 읽어요', async () => {
    const contents = '{"format":"alarmpyo-backup","data":{}}';
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          file: {
            size: new TextEncoder().encode(contents).length,
            text: vi.fn(async () => contents),
          },
          name: '이름만-암호화.alarmpyo',
          uri: 'blob:plain-backup',
        },
      ],
    });

    await expect(pickBackupFile()).resolves.toEqual({
      fileName: '이름만-암호화.alarmpyo',
      contents,
      encrypted: false,
    });
  });

  it('확장자가 없는 암호화 백업도 웹에서 내용으로 판별해요', async () => {
    const contents =
      '{"format":"alarmpyo-encrypted-backup","version":1,"cipher":{}}';
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          file: {
            size: new TextEncoder().encode(contents).length,
            text: vi.fn(async () => contents),
          },
          name: 'AlarmPyo-백업',
          uri: 'blob:encrypted-backup',
        },
      ],
    });

    await expect(pickBackupFile()).resolves.toEqual({
      fileName: 'AlarmPyo-백업',
      contents,
      encrypted: true,
    });
  });

  it('평문은 .alarmpyo 확장자여도 웹에서 4MB 한도를 적용해요', async () => {
    const contents = 'a'.repeat(4 * 1024 * 1024 + 1);
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          file: {
            size: contents.length,
            text: vi.fn(async () => contents),
          },
          name: '큰-평문.alarmpyo',
          uri: 'blob:large-plain',
        },
      ],
    });

    await expect(pickBackupFile()).rejects.toThrow('4MB 이하여야 해요');
  });
});
