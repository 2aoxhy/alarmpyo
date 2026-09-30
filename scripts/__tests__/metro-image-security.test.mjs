import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const parserPath = require.resolve('metro/private/lib/imageSize');
const { getAssetSize } = require('metro/private/Assets');
const { getImageDimensions } = require(parserPath);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const lock = readJson(resolve(root, 'package-lock.json'));
const expoMetro = readJson(require.resolve('@expo/metro/package.json'));
const metroFamily = Object.entries(expoMetro.dependencies).filter(([name]) =>
  /^metro(?:-|$)/u.test(name),
);

function collectPngFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectPngFiles(path);
    return entry.isFile() && /\.png$/iu.test(entry.name) ? [path] : [];
  });
}

const assetPngs = collectPngFiles(resolve(root, 'assets'));

// Each malformed input runs outside the test runner. A parser regression cannot
// block Vitest's event loop; the child has a hard deadline and no file/network IO
// beyond loading the installed parser and reading this fixture from stdin.
const rejectInChild = `
const fs = require('node:fs');
const { getImageDimensions } = require(process.argv[1]);
try {
  const dimensions = getImageDimensions(process.argv[2], fs.readFileSync(0), 'fixture');
  process.stdout.write(JSON.stringify({ accepted: dimensions }));
  process.exitCode = 2;
} catch (error) {
  process.stdout.write(JSON.stringify({ rejected: true, message: error.message }));
}
`;

// These are newly constructed invalid headers, not a copy of image-size's
// implementation. Official Metro 0.84.5 removes the unrelated ICNS/JXL/HEIF
// parsers and checks bounded forward progress in its supported formats.
// https://github.com/react/metro/releases/tag/v0.84.5
const malformedImages = [
  ['ICNS entry length zero', 'png', Buffer.from('69636e73000000106973333200000000', 'hex')],
  ['ICNS truncated header', 'png', Buffer.from('icns')],
  ['JXL box length zero', 'png', Buffer.from('000000004a584c20', 'hex')],
  ['HEIF box length zero', 'png', Buffer.from('000000006674797061766966', 'hex')],
  ['JPEG segment length zero', 'jpeg', Buffer.from('ffd8ffe00000', 'hex')],
  ['JPEG truncated segment', 'jpeg', Buffer.from('ffd8ffe0ffff00', 'hex')],
  ['WebP oversized chunk', 'webp', Buffer.from('524946461c0000005745425056503858ffffffff00000000', 'hex')],
  ['TIFF oversized IFD', 'tiff', Buffer.from('49492a0008000000ffff', 'hex')],
  ['SVG unclosed attribute', 'svg', Buffer.from(`<svg width="${'1'.repeat(1_000_000)}`)],
  ['SVG root after header limit', 'svg', Buffer.from(`${' '.repeat(65_536)}<svg width="10" height="20"/>`)],
  ['PNG empty input', 'png', Buffer.alloc(0)],
  ['PNG zero width', 'png', Buffer.from('89504e470d0a1a0a0000000d494844520000000000000001', 'hex')],
];

describe('Metro 이미지 치수 보안 경계', () => {
  it('image-size와 이름만 바꾼 npm 별칭을 잠금 파일에 남기지 않습니다', () => {
    for (const [path, entry] of Object.entries(lock.packages)) {
      expect(path, path).not.toMatch(/(?:^|\/)node_modules\/image-size(?:\/|$)/u);
      expect(entry.name, path).not.toBe('image-size');
      expect(entry.resolved ?? '', path).not.toMatch(/\/image-size\/-\/image-size-/u);
      for (const field of ['dependencies', 'optionalDependencies', 'devDependencies']) {
        for (const [name, spec] of Object.entries(entry[field] ?? {})) {
          expect(name, `${path}:${field}`).not.toBe('image-size');
          expect(spec, `${path}:${name}`).not.toMatch(/^npm:image-size(?:@|$)/u);
        }
      }
    }
  });

  it('모든 Metro 경로가 Expo의 공식 0.84.5 패키지와 일치합니다', () => {
    expect(expoMetro.dependencies.metro).toBe('0.84.5');
    expect(metroFamily.length).toBeGreaterThan(0);
    const expectedVersions = new Map(metroFamily);
    const lockedFamily = Object.entries(lock.packages).filter(([path]) =>
      /(?:^|\/)node_modules\/metro(?:-[^/]+)?$/u.test(path),
    );
    expect(lockedFamily.length).toBeGreaterThanOrEqual(metroFamily.length);
    for (const [path, entry] of lockedFamily) {
      const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
      expect(expectedVersions.has(name), name).toBe(true);
      expect(entry.version, path).toBe(expectedVersions.get(name));
      expect(entry.resolved, path).toBe(
        `https://registry.npmjs.org/${name}/-/${name}-${entry.version}.tgz`,
      );
      expect(entry.integrity, path).toMatch(/^sha512-/u);
      const installed = readJson(resolve(root, path, 'package.json'));
      expect(installed.name, path).toBe(name);
      expect(installed.version, path).toBe(expectedVersions.get(name));
    }
    for (const consumer of ['@expo/metro', '@react-native/community-cli-plugin', 'react-native-worklets']) {
      const consumerRequire = createRequire(require.resolve(`${consumer}/package.json`));
      const installedMetro = readJson(consumerRequire.resolve('metro/package.json'));
      expect(installedMetro.version, consumer).toBe(expoMetro.dependencies.metro);
      expect(installedMetro.dependencies).not.toHaveProperty('image-size');
    }
  });

  it('실제 PNG 자산 검사 목록이 비어 있지 않습니다', () => {
    expect(assetPngs.length).toBeGreaterThan(0);
  });

  it.each(assetPngs.map((path) => [relative(root, path), path]))(
    '실제 %s 치수가 Sharp와 Metro에서 같습니다',
    async (_, path) => {
      const content = readFileSync(path);
      const metadata = await sharp(content).metadata();
      expect(metadata.format).toBe('png');
      expect(getAssetSize('png', content, path)).toEqual({
        width: metadata.width,
        height: metadata.height,
      });
    },
  );

  it('확장자보다 실제 PNG 내용을 우선하던 Metro 호환성을 유지합니다', () => {
    const content = readFileSync(assetPngs[0]);
    expect(getImageDimensions('jpeg', content, 'renamed.jpeg')).toEqual(
      getImageDimensions('png', content, 'original.png'),
    );
  });

  it.each(malformedImages)('%s를 제한 시간 안에 거부합니다', (_, type, content) => {
    const result = spawnSync(process.execPath, ['-e', rejectInChild, parserPath, type], {
      cwd: root,
      encoding: 'utf8',
      input: content,
      maxBuffer: 8_192,
      timeout: 2_000,
      windowsHide: true,
    });
    expect(result.error, result.error?.message).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      rejected: true,
      message: `Invalid ${type} image asset: fixture`,
    });
  });
});
