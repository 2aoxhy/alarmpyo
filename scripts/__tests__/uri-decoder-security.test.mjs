import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const queryString = require('query-string');
const queryRequire = createRequire(require.resolve('query-string'));
const decode = queryRequire('decode-uri-component');
const patched = require('decode-uri-component-patched').default;
// Stop collection before invoking any parser if npm did not install the bridge.
// This suite must never run an old decoder inside the test runner.
if (decode !== patched || typeof decode !== 'function') {
  throw new Error('query-string must resolve the official patched decoder through the CJS bridge');
}
const decoderPath = queryRequire.resolve('decode-uri-component');
const queryStringPath = require.resolve('query-string');
const digest = (value) => createHash('sha256').update(value).digest('hex');

// These small compatibility expectations are independent fixtures. Never load
// an old decoder to establish an oracle: all malformed-input performance checks
// run below in timeout-limited children, including query-string's actual path.
const decodingCases = [
  ['empty', '', ''],
  ['Korean', '%EC%A3%BC%EA%B0%84%20%EA%B7%BC%EB%AC%B4', '주간 근무'],
  ['emoji', '%F0%9F%95%92%20%F0%9F%8C%99', '🕒 🌙'],
  ['literal Korean', '알람표 휴무', '알람표 휴무'],
  ['percent', '100%25', '100%'],
  ['single decoding pass', '%252F%2525', '%2F%25'],
  ['literal plus', '주간+야간', '주간+야간'],
  ['encoded plus', '%2B', '+'],
  ['trailing percent', '%EC%95%BC%', '야%'],
  ['invalid hex', '%GG%20%G0', '%GG %G0'],
  ['truncated UTF-8', '%F0%9F%98', '%F0%9F%98'],
  ['broken UTF-8 with ASCII', '%E2%41%AC', '%E2A%AC'],
  ['orphan continuation byte', '%80', '%80'],
  ['overlong UTF-8', '%C0%AF', '%C0%AF'],
  ['surrogate UTF-8', '%ED%A0%80', '%ED%A0%80'],
  ['legacy truncated C2 replacement', '%C2', '\uFFFD'],
  ['legacy BOM replacement', '%FE%FF', '\uFFFD\uFFFD'],
  ['percent byte cannot join a later sequence', '%84%D7%25%88%90', '%84%D7%%88%90'],
];

const parseInChild = `
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const input = fs.readFileSync(0, 'utf8');
const mode = process.argv[1];
const parser = require(process.argv[2]);
const value = mode === 'query' ? parser.parse('value=' + input).value : parser(input);
if (typeof value !== 'string') throw new Error('Expected a decoded string');
process.stdout.write(JSON.stringify({
  length: value.length,
  sha256: createHash('sha256').update(value).digest('hex'),
}));
`;

// GHSA-vcc3-ghjq-m6fr concerns repeated malformed percent-encoded runs. The
// official 0.5.0 scanner advances through these runs without recursive splitting.
// Inputs and expected outputs are constructed here; no vulnerable code is copied.
const longMalformedCases = [
  ['continuation bytes', '%80'.repeat(24_000), '%80'.repeat(24_000)],
  ['incomplete sequences', '%E0%A4%A'.repeat(8_000), '%E0%A4%A'.repeat(8_000)],
  ['invalid hex', '%G0'.repeat(24_000), '%G0'.repeat(24_000)],
  ['valid Korean with malformed bytes', '%ED%9C%B4%80'.repeat(6_000), '휴%80'.repeat(6_000)],
];

describe('URI decoder 보안 호환 경계', () => {
  it('공식 수정판의 default 함수를 그대로 CommonJS에 연결합니다', () => {
    expect(typeof decode).toBe('function');
    expect(decode).toBe(patched);
    expect(readFileSync(resolve(root, 'tooling/uri-decoder-compat/index.cjs'), 'utf8').trim())
      .toBe("module.exports = require('decode-uri-component-patched').default;");
    expect(readJson(resolve(dirname(decoderPath), 'package.json')).name)
      .toBe('@alarmpyo/uri-decoder-compat');
  });

  it('공식 0.5.0 별칭과 원본 tarball 무결성을 잠금 파일에 유지합니다', () => {
    const manifest = readJson(resolve(root, 'package.json'));
    const lock = readJson(resolve(root, 'package-lock.json'));
    expect(manifest.dependencies['decode-uri-component'])
      .toBe('file:./tooling/uri-decoder-compat');
    expect(manifest.dependencies['decode-uri-component-patched'])
      .toBe('npm:decode-uri-component@0.5.0');
    expect(manifest.overrides['query-string@7.1.3'])
      .toEqual({ 'decode-uri-component': '$decode-uri-component' });
    expect(readJson(require.resolve('query-string/package.json')).version).toBe('7.1.3');
    expect(lock.packages['node_modules/decode-uri-component']).toEqual({
      resolved: 'tooling/uri-decoder-compat',
      link: true,
    });
    expect(lock.packages)
      .not.toHaveProperty('node_modules/query-string/node_modules/decode-uri-component');
    expect(lock.packages)
      .not.toHaveProperty('node_modules/query-string/tooling/uri-decoder-compat');
    const official = lock.packages['node_modules/decode-uri-component-patched'];
    expect(official.name).toBe('decode-uri-component');
    expect(official.version).toBe('0.5.0');
    expect(official.dev).not.toBe(true);
    expect(official.resolved)
      .toBe('https://registry.npmjs.org/decode-uri-component/-/decode-uri-component-0.5.0.tgz');
    expect(official.integrity).toMatch(/^sha512-/u);
    const installed = readJson(resolve(dirname(require.resolve('decode-uri-component-patched')), 'package.json'));
    expect(installed.name).toBe('decode-uri-component');
    expect(installed.version).toBe('0.5.0');
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (entry.name === 'decode-uri-component') {
        expect(entry.version, path).toBe('0.5.0');
      }
      if (/(?:^|\/)node_modules\/decode-uri-component$/u.test(path)) {
        const consumer = readJson(resolve(root, path, 'package.json'));
        expect(consumer.name, path).toBe('@alarmpyo/uri-decoder-compat');
      }
      expect(entry.resolved ?? '', path)
        .not.toMatch(/\/decode-uri-component-0\.[0-4]\./u);
    }
  });

  it.each(decodingCases)('%s 디코딩 결과를 유지합니다', (_, input, expected) => {
    expect(decode(input)).toBe(expected);
  });

  it.each([null, undefined, 42, {}, []].map((input) => [input]))('문자열이 아닌 %j 입력은 거부합니다', (input) => {
    expect(() => decode(input)).toThrow(TypeError);
  });

  it('query-string 7의 한국어·emoji·중복·빈 값·null 계약을 유지합니다', () => {
    const parsed = queryString.parse('shift=%EC%A3%BC%EA%B0%84&shift=%EC%95%BC%EA%B0%84&empty=&unset&title=%F0%9F%8C%99+%ED%9C%B4%EB%AC%B4&percent=100%25');
    expect({ ...parsed }).toEqual({
      shift: ['주간', '야간'],
      empty: '',
      unset: null,
      title: '🌙 휴무',
      percent: '100%',
    });
    expect({ ...queryString.parse(queryString.stringify(parsed)) }).toEqual({ ...parsed });
  });

  it.each(['none', 'bracket', 'index', 'comma'])('%s 배열 형식을 왕복합니다', (arrayFormat) => {
    const query = { sequence: ['주간', '야간', '휴무'], label: '주주야야휴휴' };
    const serialized = queryString.stringify(query, { arrayFormat });
    expect({ ...queryString.parse(serialized, { arrayFormat }) }).toEqual(query);
  });

  it.each([
    ['alarmpyo:///pattern', { name: '주주야야휴휴', sequence: ['주간', '주간', '야간', '야간', '휴무', '휴무'], referenceDate: '2026-09-13' }],
    ['alarmpyo:///alarm-settings', { from: '오늘', note: null, empty: '', title: '야간 🌙', percent: '100%' }],
    ['alarmpyo:///timer', { minutes: '15', from: '홈 화면' }],
  ])('%s URL의 쿼리 직렬화 계약을 유지합니다', (url, query) => {
    const parsed = queryString.parseUrl(queryString.stringifyUrl({ url, query }));
    expect(parsed.url).toBe(url);
    expect({ ...parsed.query }).toEqual(query);
  });

  it.each(longMalformedCases)('%s를 두 parser 경로 모두 2초 안에 처리합니다', (_, input, expected) => {
    for (const [mode, parserPath] of [['decode', decoderPath], ['query', queryStringPath]]) {
      const result = spawnSync(process.execPath, ['-e', parseInChild, mode, parserPath], {
        cwd: root,
        encoding: 'utf8',
        input,
        maxBuffer: 8_192,
        timeout: 2_000,
        windowsHide: true,
      });
      expect(result.error, `${mode}: ${result.error?.message}`).toBeUndefined();
      expect(result.signal, mode).toBeNull();
      expect(result.status, `${mode}: ${result.stderr || result.stdout}`).toBe(0);
      expect(JSON.parse(result.stdout), mode).toEqual({
        length: expected.length,
        sha256: digest(expected),
      });
    }
  });
});
