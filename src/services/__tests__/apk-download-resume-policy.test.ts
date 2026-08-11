import { describe, expect, it } from 'vitest';

import {
  canResumeApkDownload,
  createApkDownloadResumeState,
  parseApkDownloadResumeState,
} from '../apk-download-resume-policy';

const validState = createApkDownloadResumeState({
  versionCode: 34,
  url: 'https://example.com/ALARMPYO.apk',
  fileUri: 'file:///cache/ALARMPYO_34.apk.part',
  sizeBytes: 1000,
  resumeData: '400',
  now: new Date('2026-07-17T00:00:00.000Z'),
});

describe('APK 이어받기 상태', () => {
  it('정상 상태를 읽고 같은 파일만 이어받습니다', () => {
    const parsed = parseApkDownloadResumeState(validState);
    expect(parsed).toEqual(validState);
    expect(
      canResumeApkDownload(parsed, {
        versionCode: 34,
        url: validState.url,
        fileUri: validState.fileUri,
        sizeBytes: 1000,
        partialSize: 400,
      }),
    ).toBe(true);
  });

  it('파일 크기나 버전이 바뀌면 이어받지 않습니다', () => {
    expect(
      canResumeApkDownload(validState, {
        versionCode: 35,
        url: validState.url,
        fileUri: validState.fileUri,
        sizeBytes: 1000,
        partialSize: 400,
      }),
    ).toBe(false);
    expect(
      canResumeApkDownload(validState, {
        versionCode: 34,
        url: validState.url,
        fileUri: validState.fileUri,
        sizeBytes: 1000,
        partialSize: 401,
      }),
    ).toBe(false);
  });

  it('다운로드 주소가 바뀌면 다른 서버의 부분 파일을 이어받지 않습니다', () => {
    expect(
      canResumeApkDownload(validState, {
        versionCode: 34,
        url: 'https://mirror.example.com/ALARMPYO.apk',
        fileUri: validState.fileUri,
        sizeBytes: 1000,
        partialSize: 400,
      }),
    ).toBe(false);
  });

  it('안전하지 않은 주소와 잘못된 오프셋을 거부합니다', () => {
    expect(
      parseApkDownloadResumeState({
        ...validState,
        url: 'http://example.com/ALARMPYO.apk',
      }),
    ).toBeNull();
    expect(
      parseApkDownloadResumeState({ ...validState, resumeData: '-1' }),
    ).toBeNull();
  });
});
