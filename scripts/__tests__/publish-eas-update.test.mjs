import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..', '..');

describe('OTA 후보 승격과 롤백', () => {
  it('후보 브랜치에 먼저 게시하고 검증 뒤 채널을 전환하며 실패하면 되돌려요', async () => {
    const source = await readFile(
      resolve(root, 'scripts', 'publish-eas-update.mjs'),
      'utf8',
    );
    expect(source).toContain(
      "['update', '--branch', candidateBranch, ...publishArgs]",
    );
    expect(source).not.toContain("['update', '--channel'");
    expect(source).toContain("['channel:edit', channel, '--branch', branch]");
    expect(source).toContain('pointChannel(channel, previousBranch)');
    expect(source).toContain('readChannel(channel) !== candidateBranch');
    expect(source).toContain("'rev-parse'");
    expect(source).toContain("'.release', 'latest-ota.json'");
    expect(source).toContain('sourceCommit');
    expect(source).toContain('groups');
    expect(source).toContain('nativeFingerprint');
    expect(source).toContain('baseApk');
    expect(source).toContain('publicManifest.sha256');
    expect(source).toContain('appendOtaLedgerEntry');
    expect(source).toContain('restoreFileSnapshot(ledgerPath');
  });
});
