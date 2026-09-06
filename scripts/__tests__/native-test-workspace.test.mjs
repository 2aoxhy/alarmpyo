import { describe, expect, it } from 'vitest';
import { includeNativeTestSource } from '../native-test-workspace.mjs';

describe('native verification source copy', () => {
  it.each([
    '.release/play/old.aab', '.artifacts/qa/device.png', '.codex-remote-attachments/photo.png',
    '.git/config', 'dist/index.html', 'node_modules/react/index.js', 'android/app/build.gradle',
    'public/downloads/history.json', 'old.AAB', 'modules/alarm/android/build/intermediates/a.xml',
    'modules/alarm/android/.gradle/cache.bin', '../other/file',
  ])('does not copy %s', (path) => {
    expect(includeNativeTestSource(path)).toBe(false);
    expect(includeNativeTestSource(path.replaceAll('/', '\\'))).toBe(false);
  });
  it.each([
    '', 'package-lock.json', 'app.config.js', 'plugins/with-alarm.js', 'assets/icon.png',
    'modules/alarmpyo-alarm/android/src/main/res/layout/widget.xml',
    'modules/alarmpyo-alarm/android/build.gradle', 'src/app/_layout.tsx',
  ])('keeps build source %s', (path) => expect(includeNativeTestSource(path)).toBe(true));
});
