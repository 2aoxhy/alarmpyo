import { spawnSync } from 'node:child_process';
import { mkdtemp, cp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapOfficialPatternSigningKey } from '../bootstrap-official-pattern-signing-key.mjs';
import { signOfficialShiftPatterns } from '../sign-official-shift-patterns.mjs';
import { verifyOfficialShiftPatterns } from '../verify-official-shift-patterns.mjs';
import { validateOfficialShiftPatternSources } from '../validate-official-shift-pattern-sources.mjs';
import { parseAndValidateShiftPattern } from '../../src/services/shift-pattern-schema.ts';

const temporaryRoots = [];

async function temporaryDirectory(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function preparedSigningFixture() {
  const directory = await temporaryDirectory('alarmpyo-pattern-signing-');
  const officialRoot = join(directory, 'official-patterns');
  const outputDirectory = join(directory, 'output');
  const privateKeyOutput = join(directory, 'secret.pem');
  await cp(resolve('official-patterns'), officialRoot, { recursive: true });
  await writeFile(
    join(officialRoot, 'public-keyring.json'),
    `${JSON.stringify({ schemaVersion: 1, algorithm: 'ECDSA_P256_SHA256', keys: [] }, null, 2)}\n`,
    'utf8',
  );
  await bootstrapOfficialPatternSigningKey({ officialRoot, privateKeyOutput });
  const privateKey = await readFile(privateKeyOutput, 'utf8');
  return { directory, officialRoot, outputDirectory, privateKey, privateKeyOutput };
}

describe('공식 근무 패턴 서명 파이프라인', () => {
  it('manifest keyId의 실제 공개키가 없는 source 계약을 출시 게이트에서 거부합니다', async () => {
    const directory = await temporaryDirectory('alarmpyo-pattern-empty-keyring-');
    const officialRoot = join(directory, 'official-patterns');
    await cp(resolve('official-patterns'), officialRoot, { recursive: true });
    await writeFile(
      join(officialRoot, 'public-keyring.json'),
      `${JSON.stringify({ schemaVersion: 1, algorithm: 'ECDSA_P256_SHA256', keys: [] }, null, 2)}\n`,
      'utf8',
    );
    await expect(validateOfficialShiftPatternSources({ officialRoot })).rejects.toThrow(
      '정확히 한 개',
    );
  });

  it('저장소 밖 임시 비공개키와 커밋 가능한 공개키로 세 파일을 서명·검증합니다', async () => {
    const fixture = await preparedSigningFixture();
    const paths = await signOfficialShiftPatterns({
      officialRoot: fixture.officialRoot,
      outputDirectory: fixture.outputDirectory,
      environment: { SHIFT_PATTERN_SIGNING_PRIVATE_KEY_PEM: fixture.privateKey },
    });
    expect(paths).toHaveLength(3);
    await expect(
      verifyOfficialShiftPatterns({
        officialRoot: fixture.officialRoot,
        directory: fixture.outputDirectory,
      }),
    ).resolves.toHaveLength(3);

    const keyringDocument = JSON.parse(
      await readFile(join(fixture.officialRoot, 'public-keyring.json'), 'utf8'),
    );
    const runtimeKeyring = new Map(
      keyringDocument.keys.map((key) => [key.id, key]),
    );
    const appVerified = parseAndValidateShiftPattern(
      await readFile(join(fixture.outputDirectory, 'humantss_a.json'), 'utf8'),
      { keyring: runtimeKeyring },
    );
    expect(appVerified).toMatchObject({
      id: 'humantss_a',
      verification: { status: 'official-verified' },
    });

    const source = await readFile(
      join(fixture.officialRoot, 'sources', 'humantss_a.source.json'),
      'utf8',
    );
    expect(source).not.toContain('"signature"');
    expect(source).not.toContain('"contentSha256"');
  });

  it('내용 변조, 빈 keyring, 누락 secret과 다른 키를 fail-closed 처리합니다', async () => {
    const fixture = await preparedSigningFixture();
    await signOfficialShiftPatterns({
      officialRoot: fixture.officialRoot,
      outputDirectory: fixture.outputDirectory,
      environment: { SHIFT_PATTERN_SIGNING_PRIVATE_KEY_PEM: fixture.privateKey },
    });
    const path = join(fixture.outputDirectory, 'humantss_a.json');
    await writeFile(path, (await readFile(path, 'utf8')).replace('NIGHT', 'DAY'), 'utf8');
    await expect(
      verifyOfficialShiftPatterns({
        officialRoot: fixture.officialRoot,
        directory: fixture.outputDirectory,
      }),
    ).rejects.toThrow('manifest');

    await expect(
      signOfficialShiftPatterns({
        officialRoot: fixture.officialRoot,
        outputDirectory: join(fixture.directory, 'missing-secret'),
        environment: {},
      }),
    ).rejects.toThrow('중 하나만 설정');

    const other = await preparedSigningFixture();
    await expect(
      signOfficialShiftPatterns({
        officialRoot: fixture.officialRoot,
        outputDirectory: join(fixture.directory, 'wrong-key'),
        environment: { SHIFT_PATTERN_SIGNING_PRIVATE_KEY_PEM: other.privateKey },
      }),
    ).rejects.toThrow('keyring이 일치하지 않습니다');
  });

  it('CLI 오류 출력에 Environment 비공개키 원문을 포함하지 않습니다', async () => {
    const privateKeyLabel = ['PRIVATE', 'KEY'].join(' ');
    const distinctiveSecret = `-----${'BEGIN'} ${privateKeyLabel}-----\nDO-NOT-LOG-THIS-VALUE\n-----END ${privateKeyLabel}-----`;
    const output = await temporaryDirectory('alarmpyo-pattern-output-');
    const result = spawnSync(
      process.execPath,
      ['scripts/sign-official-shift-patterns.mjs', '--output-dir', output],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, SHIFT_PATTERN_SIGNING_PRIVATE_KEY_PEM: distinctiveSecret },
      },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain('DO-NOT-LOG-THIS-VALUE');
    expect(`${result.stdout}${result.stderr}`).not.toContain(`BEGIN ${privateKeyLabel}`);
  });

  it('bootstrap은 저장소 내부 경로와 기존 파일 덮어쓰기를 거부합니다', async () => {
    await expect(
      bootstrapOfficialPatternSigningKey({
        privateKeyOutput: resolve('forbidden-pattern-private.pem'),
      }),
    ).rejects.toThrow('저장소 밖');

    const fixture = await preparedSigningFixture();
    await expect(
      bootstrapOfficialPatternSigningKey({
        officialRoot: fixture.officialRoot,
        privateKeyOutput: fixture.privateKeyOutput,
      }),
    ).rejects.toThrow('이미 있습니다');
  });
});
