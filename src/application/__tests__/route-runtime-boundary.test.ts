// Vitest runs in Node, while the app tsconfig intentionally omits Node types.
// @ts-expect-error Node standard library is provided by the test runner.
import { readdirSync, readFileSync } from 'node:fs';
// @ts-expect-error Node standard library is provided by the test runner.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type DirectoryEntry = {
  name: string;
  isDirectory(): boolean;
};

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, {
    withFileTypes: true,
  }) as DirectoryEntry[];
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const ROUTE_FORBIDDEN_IMPORTS = [
  '@react-native-async-storage/async-storage',
  'expo-haptics',
  '@/infrastructure/',
  '@/hooks/use-alarm-runtime-status',
  '@/services/alarmpyo-alarm-service',
  '@/services/sleep-reminder-service',
  '@/services/play-app-update-service',
  '@/services/backup-file-service',
  '@/services/encrypted-backup-service',
  '@/services/work-settings-share-file-service',
  '@/services/widget-pin-service',
  '@/services/app-distribution',
  '@/services/official-shift-pattern-service',
  '@/services/shift-pattern-file-service',
  '@/services/apk-update-service',
] as const;

const FEATURE_UI_FORBIDDEN_IMPORTS = [
  'expo-updates',
  'expo-haptics',
  '@/services/app-distribution',
  '@/services/play-app-update-service',
  '@/services/apk-update-service',
  '@/services/official-shift-pattern-service',
  '@/services/shift-pattern-file-service',
  '@/services/widget-pin-service',
] as const;

function isFeatureController(file: string): boolean {
  return /(?:^|[\\/])(?:use-[^\\/]*-controller|[^\\/]*-controller)\.tsx?$/u.test(
    file,
  );
}

function importViolations(
  files: readonly string[],
  forbidden: readonly string[],
) {
  return files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return forbidden
      .filter(
        (dependency) =>
          source.includes(`from '${dependency}`) ||
          source.includes(`from "${dependency}`),
      )
      .map((dependency) => ({ file, dependency }));
  });
}

describe('route runtime boundary', () => {
  // src/app/_layout.tsx is the app-composition error boundary. Its
  // expo-updates reload fallback is intentionally the only route-level update
  // runtime exception; feature screens remain covered below.
  it('keeps storage and native runtime calls behind controllers', () => {
    const violations = importViolations(
      sourceFiles(join(process.cwd(), 'src', 'app')),
      ROUTE_FORBIDDEN_IMPORTS,
    );

    expect(violations).toEqual([]);
  });

  it('keeps update, network, file, and widget effects out of feature views', () => {
    const featureViews = sourceFiles(
      join(process.cwd(), 'src', 'features'),
    ).filter((file) => !isFeatureController(file));

    expect(importViolations(featureViews, FEATURE_UI_FORBIDDEN_IMPORTS)).toEqual(
      [],
    );
  });

  it('centralizes native haptic feedback in the shared feedback controller', () => {
    const featureFiles = sourceFiles(join(process.cwd(), 'src', 'features'));
    const hapticImports = importViolations(featureFiles, ['expo-haptics']);

    expect(hapticImports).toHaveLength(1);
    expect(hapticImports[0]?.file.replaceAll('\\', '/')).toMatch(
      /\/features\/feedback\/feedback-controller\.ts$/u,
    );
  });
});
