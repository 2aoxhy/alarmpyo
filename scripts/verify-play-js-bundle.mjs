import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DIRECT_UPDATE_BUNDLE_SENTINEL,
  PLAY_UPDATE_BUNDLE_SENTINEL,
} from './play-release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const auditRoot = resolve(root, '.release');

async function filesUnder(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

export async function verifyPlayJavascriptBundle() {
  const output = resolve(auditRoot, `play-js-audit-${randomUUID()}`);
  if (!output.startsWith(`${auditRoot}\\`) && !output.startsWith(`${auditRoot}/`)) {
    throw new Error('Play JavaScript 검증 폴더가 안전하지 않아요.');
  }
  try {
    const expoCli = resolve(root, 'node_modules', 'expo', 'bin', 'cli');
    const result = spawnSync(
      process.execPath,
      [expoCli, 'export', '--platform', 'android', '--output-dir', output, '--clear'],
      {
        cwd: root,
        env: {
          ...process.env,
          ALARMPYO_DISTRIBUTION: 'play',
          EXPO_NO_TELEMETRY: '1',
        },
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        [result.stderr, result.stdout, result.error?.message]
          .filter(Boolean)
          .join('\n') || 'Play JavaScript 번들을 생성하지 못했어요.',
      );
    }

    let hasPlaySurface = false;
    for (const file of await filesUnder(output)) {
      const contents = await readFile(file);
      if (contents.includes(Buffer.from(DIRECT_UPDATE_BUNDLE_SENTINEL, 'utf8'))) {
        throw new Error('Play JavaScript 번들에 직접 APK 업데이트 화면이 포함됐어요.');
      }
      if (contents.includes(Buffer.from(PLAY_UPDATE_BUNDLE_SENTINEL, 'utf8'))) {
        hasPlaySurface = true;
      }
    }
    if (!hasPlaySurface) {
      throw new Error('Play JavaScript 번들에서 Google Play 업데이트 화면을 확인하지 못했어요.');
    }
    return true;
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  verifyPlayJavascriptBundle()
    .then(() => console.log('Play JavaScript 번들에서 직접 APK 업데이트 코드가 제외된 것을 확인했어요.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
