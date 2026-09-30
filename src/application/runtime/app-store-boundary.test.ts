// @ts-expect-error Node standard library is supplied by Vitest, not the app runtime.
import { readFileSync, existsSync } from 'node:fs';
// @ts-expect-error Node standard library is supplied by Vitest, not the app runtime.
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function runtimeDependencyGraph(entry: string) {
  const visited = new Set<string>();
  const violations: string[] = [];
  const visit = (file: string, trail: string[]) => {
    if (visited.has(file)) return;
    visited.add(file);
    if (file.endsWith('.json')) return;
    const emitted = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: file,
    }).outputText;
    const parsed = ts.createSourceFile(file, emitted, ts.ScriptTarget.Latest, true);
    const dependencies: string[] = [];
    for (const statement of parsed.statements) {
      if (
        !(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
        !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      dependencies.push(statement.moduleSpecifier.text);
    }
    const inspectDynamicImports = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        const specifier = node.arguments[0];
        if (specifier && ts.isStringLiteral(specifier)) dependencies.push(specifier.text);
        else violations.push([...trail, 'non-static runtime import'].join(' -> '));
      }
      ts.forEachChild(node, inspectDynamicImports);
    };
    inspectDynamicImports(parsed);
    for (const specifier of dependencies) {
      const resolved = specifier.startsWith('.')
        ? path.resolve(path.dirname(file), specifier)
        : specifier.startsWith('@/')
          ? path.resolve('src', specifier.slice(2))
          : null;
      if (!resolved) {
        violations.push([...trail, specifier].join(' -> '));
        continue;
      }
      const target = [
        resolved,
        resolved + '.ts',
        resolved + '.tsx',
        path.join(resolved, 'index.ts'),
      ].find((candidate) => existsSync(candidate));
      if (!target) {
        violations.push([...trail, specifier].join(' -> '));
        continue;
      }
      const relative = path.relative(process.cwd(), target).replaceAll('\\', '/');
      const nextTrail = [...trail, relative];
      if (/^src\/(infrastructure|features|app|store|components|hooks)\//.test(relative))
        violations.push(nextTrail.join(' -> '));
      else visit(target, nextTrail);
    }
  };
  visit(path.resolve(entry), [entry]);
  return {
    violations,
    visited: [...visited].map((file) => path.relative(process.cwd(), file).replaceAll('\\', '/')),
  };
}

describe('AppStoreEngine runtime boundary', () => {
  it('has no transitive storage/native/React/UI dependencies, including compatibility facades', () => {
    expect(
      runtimeDependencyGraph('src/application/runtime/app-store-engine.ts').violations,
    ).toEqual([]);
  });
});
