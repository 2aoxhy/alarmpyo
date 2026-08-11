import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ArtifactIntegrityError,
  EndpointUnavailableError,
  acceptsManifestVersion,
  cancelResponseBody,
  createFullDeploymentValidationArgs,
  endpointFailureBlocksRelease,
  isDurableApkMirrorUrl,
  requiresCompleteProvenance,
} from '../release-validation-policy.mjs';

describe('배포 검증 정책', () => {
  it('현재 앱보다 이전인 공개 manifest를 복구 기준으로 허용해요', () => {
    const input = {
      appVersionCode: 2,
      appVersionName: '1.0.1',
      manifestVersionCode: 1,
      manifestVersionName: '1.0.0',
    };
    expect(acceptsManifestVersion({ ...input, allowHistorical: false })).toEqual({
      versionCodeAccepted: false,
      versionNameAccepted: false,
    });
    expect(acceptsManifestVersion({ ...input, allowHistorical: true })).toEqual({
      versionCodeAccepted: true,
      versionNameAccepted: true,
    });
  });

  it('복구 기준은 전체 온라인 검증 옵션을 빠짐없이 사용해요', () => {
    expect(
      createFullDeploymentValidationArgs({
        allowHistorical: true,
        baseUrl: 'https://example.expo.app/',
        manifestPath: 'public/updates/latest-android.json',
      }),
    ).toEqual([
      '--require-durable-apk',
      '--check-urls',
      '--verify-apk-content',
      '--verify-online-manifest',
      '--manifest',
      'public/updates/latest-android.json',
      '--allow-historical-manifest-version',
      '--deployment-base-url',
      'https://example.expo.app/',
    ]);
  });

  it('새 배포 검증에서만 EAS provenance 원본 재검증을 명시해요', () => {
    expect(
      createFullDeploymentValidationArgs({
        baseUrl: 'https://example.expo.app/',
        verifyProvenanceArtifact: true,
      }),
    ).toContain('--verify-provenance-artifact');
    expect(
      createFullDeploymentValidationArgs({
        allowHistorical: true,
        baseUrl: 'https://example.expo.app/',
      }),
    ).not.toContain('--verify-provenance-artifact');
  });

  it('legacy manifest는 새 필드가 전혀 없을 때만 provenance 누락을 허용해요', () => {
    expect(
      requiresCompleteProvenance({
        allowHistorical: true,
        isCurrentVersion: false,
        provenanceValues: [undefined, null, undefined],
      }),
    ).toBe(false);
    expect(
      requiresCompleteProvenance({
        allowHistorical: true,
        isCurrentVersion: false,
        provenanceValues: [undefined, 'https://artifact.example/app.apk'],
      }),
    ).toBe(true);
    expect(
      requiresCompleteProvenance({
        allowHistorical: true,
        isCurrentVersion: true,
        provenanceValues: [],
      }),
    ).toBe(true);
  });

  it('선택 미러 중단은 허용하고 필수 미러 중단과 무결성 불일치는 차단해요', () => {
    expect(
      endpointFailureBlocksRelease({
        error: new EndpointUnavailableError('중단'),
        isPrimary: false,
      }),
    ).toBe(false);
    expect(
      endpointFailureBlocksRelease({
        error: new EndpointUnavailableError('중단'),
        isPrimary: false,
        isRequired: true,
      }),
    ).toBe(true);
    expect(
      endpointFailureBlocksRelease({
        error: new ArtifactIntegrityError('불일치'),
        isPrimary: false,
      }),
    ).toBe(true);
    expect(
      endpointFailureBlocksRelease({
        error: new EndpointUnavailableError('중단'),
        isPrimary: true,
      }),
    ).toBe(true);
  });

  it('EAS 임시 산출물과 장기 보관 APK 미러를 구분해요', () => {
    expect(
      isDurableApkMirrorUrl(
        'https://expo.dev/artifacts/eas/temporary-release.apk',
      ),
    ).toBe(false);
    expect(
      isDurableApkMirrorUrl('https://releases.example.com/alarmpyo/v2.apk'),
    ).toBe(true);
    expect(isDurableApkMirrorUrl('http://releases.example.com/v2.apk')).toBe(
      false,
    );
  });

  it('실패 응답 본문을 닫고 검증 프로세스를 안전하게 종료해요', async () => {
    let cancelled = false;
    await cancelResponseBody({
      body: {
        cancel: async () => {
          cancelled = true;
        },
      },
    });
    expect(cancelled).toBe(true);
    await expect(
      cancelResponseBody({
        body: { cancel: async () => Promise.reject(new Error('잠긴 스트림')) },
      }),
    ).resolves.toBeUndefined();
  });

  it('검증 실패는 네트워크 정리 후 종료 코드 1로 끝내요', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '..', 'validate-release.mjs'),
      'utf8',
    );
    expect(source).toContain('process.exitCode = 1');
    expect(source).not.toContain('process.exit(1)');
  });
});
