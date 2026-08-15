import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import ts from 'typescript';

const INFORMAL_ENDING =
  /[가-힣]*(?:이에요|예요|했어요|됐어요|해요|돼요|커요|쳐요|아요|어요|여요|려요|져요|켜요|줘요|봐요|와요|워요|나요|가요|라요|네요|군요|죠|세요|까요)(?![가-힣])/gu;
const STRONG_COPY_IDENTIFIER =
  /^(?:shiftName|title|label|message|description|hint|copy|feedback|text|[A-Za-z0-9_]*(?:Title|Label|Message|Description|Hint|Copy|Feedback|Text))$/u;
const TEST_FILE = /(?:^|[\\/])__tests__(?:[\\/])|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

export const COPY_POLICY_DOCUMENTS = Object.freeze([
  'app.json',
  'public/privacy-policy.html',
  'docs/privacy-policy-github-pages-ko.md',
  'docs/google-play-listing-ko.md',
  'docs/google-play-release-notes-ko.md',
]);

function lineAt(text, offset) {
  return text.slice(0, offset).split(/\r?\n/u).length;
}

function compact(value) {
  return value.replace(/\s+/gu, ' ').trim().slice(0, 160);
}

export function findInformalEndings(text) {
  const matches = [];
  for (const match of text.matchAll(INFORMAL_ENDING)) {
    matches.push({ index: match.index ?? 0, text: match[0] });
  }
  return matches;
}

function pushTextViolations(violations, file, sourceText, value, offset, kind) {
  for (const match of findInformalEndings(value)) {
    violations.push({
      file,
      line: lineAt(sourceText, offset + match.index),
      kind,
      excerpt: compact(value),
      match: match.text,
    });
  }
}

function isStrongCopyExpression(node) {
  const identifier = node.getText().trim().split('.').at(-1)?.replace(/\?$/u, '');
  return identifier ? STRONG_COPY_IDENTIFIER.test(identifier) : false;
}

function isBareNameCopyExpression(node) {
  return /(?:^|\.)name$/iu.test(node.getText().trim());
}

function isInternalLogLiteral(node) {
  let current = node.parent;
  while (current && !ts.isStatement(current)) {
    if (ts.isCallExpression(current)) {
      const expression = current.expression;
      return (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === 'console' &&
        ['debug', 'error', 'info', 'log', 'trace', 'warn'].includes(
          expression.name.text,
        )
      );
    }
    current = current.parent;
  }
  return false;
}

function containsKoreanLiteral(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (
      (ts.isStringLiteralLike(child) || ts.isRegularExpressionLiteral(child)) &&
      /[가-힣]/u.test(child.getText())
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function containsLiteral(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (
      ts.isStringLiteralLike(child) ||
      ts.isNumericLiteral(child) ||
      ts.isRegularExpressionLiteral(child)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function usesCopyLiteral(expression, literal) {
  return isStrongCopyExpression(expression)
    ? containsLiteral(literal)
    : isBareNameCopyExpression(expression) && containsKoreanLiteral(literal);
}

function findCopyBranchViolation(node) {
  if (
    ts.isSwitchStatement(node) &&
    node.caseBlock.clauses.some(
      (clause) =>
        ts.isCaseClause(clause) &&
        usesCopyLiteral(node.expression, clause.expression),
    )
  ) {
    return '표시 문구 switch로 동작을 분기합니다.';
  }

  if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ].includes(node.operatorToken.kind) &&
    !ts.isTypeOfExpression(node.left) &&
    !ts.isTypeOfExpression(node.right) &&
    (usesCopyLiteral(node.left, node.right) ||
      usesCopyLiteral(node.right, node.left))
  ) {
    return '표시 문구 비교로 동작을 분기합니다.';
  }

  if (!ts.isCallExpression(node)) return null;
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const method = node.expression.name.text;
  const receiver = node.expression.expression;
  if (
    ['includes', 'startsWith', 'endsWith', 'match'].includes(method) &&
    node.arguments.some((argument) => usesCopyLiteral(receiver, argument))
  ) {
    return '표시 문구 검색으로 동작을 분기합니다.';
  }
  if (
    method === 'test' &&
    node.arguments.some((argument) => usesCopyLiteral(argument, receiver))
  ) {
    return '표시 문구 정규식으로 동작을 분기합니다.';
  }
  return null;
}

export function inspectTypeScriptCopy(file, sourceText) {
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const violations = [];

  const isTemplateLiteralFragment = (node) =>
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node);

  const visit = (node) => {
    if (
      (ts.isStringLiteralLike(node) || isTemplateLiteralFragment(node)) &&
      !isInternalLogLiteral(node) &&
      !(
        (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) &&
        node.parent.moduleSpecifier === node
      )
    ) {
      pushTextViolations(
        violations,
        file,
        sourceText,
        node.text,
        node.getStart(sourceFile) + 1,
        'informal-ending',
      );
    } else if (ts.isJsxText(node)) {
      pushTextViolations(
        violations,
        file,
        sourceText,
        node.getText(sourceFile),
        node.getStart(sourceFile),
        'informal-ending',
      );
    }

    const branchReason = findCopyBranchViolation(node);
    if (branchReason) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        file,
        line: line + 1,
        kind: 'copy-driven-branch',
        excerpt: branchReason,
        match: compact(node.getText(sourceFile)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function findNativeCommentRanges(sourceText) {
  const ranges = [];
  let index = 0;
  let state = 'code';
  let rangeStart = -1;
  while (index < sourceText.length) {
    const current = sourceText[index];
    const next = sourceText[index + 1];
    if (state === 'line-comment') {
      if (current === '\n') {
        ranges.push([rangeStart, index]);
        state = 'code';
      }
      index += 1;
      continue;
    }
    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        ranges.push([rangeStart, index + 2]);
        state = 'code';
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (state === 'string') {
      if (current === '\\') {
        index += 2;
      } else if (current === '"') {
        state = 'code';
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }
    if (state === 'character') {
      if (current === '\\') {
        index += 2;
      } else if (current === "'") {
        state = 'code';
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }
    if (current === '/' && next === '/') {
      state = 'line-comment';
      rangeStart = index;
      index += 2;
    } else if (current === '/' && next === '*') {
      state = 'block-comment';
      rangeStart = index;
      index += 2;
    } else if (current === '"') {
      state = 'string';
      index += 1;
    } else if (current === "'") {
      state = 'character';
      index += 1;
    } else {
      index += 1;
    }
  }
  if (state === 'line-comment' || state === 'block-comment') {
    ranges.push([rangeStart, sourceText.length]);
  }
  return ranges;
}

function isNativeInternalLogLiteral(sourceText, offset) {
  const lineStart = sourceText.lastIndexOf('\n', offset - 1) + 1;
  return /\bLog\.(?:d|e|i|v|w|wtf)\s*\(/u.test(
    sourceText.slice(lineStart, offset),
  );
}

function maskNativeBranchExclusions(sourceText, commentRanges) {
  const characters = [...sourceText];
  for (const [start, end] of commentRanges) {
    for (let index = start; index < end; index += 1) {
      if (characters[index] !== '\n' && characters[index] !== '\r') {
        characters[index] = ' ';
      }
    }
  }
  const masked = characters.join('');
  return masked.replace(/^.*\bLog\.(?:d|e|i|v|w|wtf)\s*\(.*$/gmu, (line) =>
    line.replace(/[^\r\n]/gu, ' '),
  );
}

function findNativeCopyBranchViolations(file, sourceText, commentRanges) {
  const violations = [];
  const searchable = maskNativeBranchExclusions(sourceText, commentRanges);
  const strongCopySegment =
    '(?:shiftName|title|label|message|description|hint|copy|feedback|text|[A-Za-z0-9_]*(?:Title|Label|Message|Description|Hint|Copy|Feedback|Text))';
  const strongCopyIdentifier =
    `(?:[A-Za-z_][A-Za-z0-9_]*\\.)*${strongCopySegment}`;
  const bareNameIdentifier = '(?:[A-Za-z_][A-Za-z0-9_]*\\.)*name';
  const stringLiteral = '"(?:\\\\.|[^"\\\\])*"';
  const koreanStringLiteral = '"(?:\\\\.|[^"\\\\])*[가-힣](?:\\\\.|[^"\\\\])*"';
  const patterns = [
    {
      reason: '표시 문구 검색으로 동작을 분기합니다.',
      regex: new RegExp(
        `\\b${strongCopyIdentifier}\\s*\\.(?:contains|startsWith|endsWith|matches)\\s*\\(\\s*${stringLiteral}`,
        'gu',
      ),
    },
    {
      reason: '표시 문구 검색으로 동작을 분기합니다.',
      regex: new RegExp(
        `\\b${bareNameIdentifier}\\s*\\.(?:contains|startsWith|endsWith|matches)\\s*\\(\\s*${koreanStringLiteral}`,
        'gu',
      ),
    },
    {
      reason: '표시 문구 비교로 동작을 분기합니다.',
      regex: new RegExp(
        `\\b${strongCopyIdentifier}\\s*(?:==|!=)\\s*${stringLiteral}`,
        'gu',
      ),
    },
    {
      reason: '표시 문구 비교로 동작을 분기합니다.',
      regex: new RegExp(
        `\\b${bareNameIdentifier}\\s*(?:==|!=)\\s*${koreanStringLiteral}`,
        'gu',
      ),
    },
    {
      reason: '표시 문구 when으로 동작을 분기합니다.',
      regex: new RegExp(
        `\\bwhen\\s*\\(\\s*${strongCopyIdentifier}\\s*\\)\\s*\\{[\\s\\S]{0,2000}?${stringLiteral}\\s*->`,
        'gu',
      ),
    },
    {
      reason: '표시 문구 when으로 동작을 분기합니다.',
      regex: new RegExp(
        `\\bwhen\\s*\\(\\s*${bareNameIdentifier}\\s*\\)\\s*\\{[\\s\\S]{0,2000}?${koreanStringLiteral}\\s*->`,
        'gu',
      ),
    },
    {
      reason: '표시 문구 switch로 동작을 분기합니다.',
      regex: new RegExp(
        `\\bswitch\\s*\\(\\s*${strongCopyIdentifier}\\s*\\)\\s*\\{[\\s\\S]{0,2000}?\\bcase\\s+${stringLiteral}`,
        'gu',
      ),
    },
    {
      reason: '표시 문구 switch로 동작을 분기합니다.',
      regex: new RegExp(
        `\\bswitch\\s*\\(\\s*${bareNameIdentifier}\\s*\\)\\s*\\{[\\s\\S]{0,2000}?\\bcase\\s+${koreanStringLiteral}`,
        'gu',
      ),
    },
  ];

  for (const { reason, regex } of patterns) {
    for (const match of searchable.matchAll(regex)) {
      const offset = match.index ?? 0;
      violations.push({
        file,
        line: lineAt(sourceText, offset),
        kind: 'copy-driven-branch',
        excerpt: reason,
        match: compact(match[0]),
      });
    }
  }
  return violations;
}

export function inspectNativeSourceCopy(file, sourceText) {
  const violations = [];
  const commentRanges = findNativeCommentRanges(sourceText);
  const stringLiteral = /"(?:\\.|[^"\\])*"/gu;
  for (const literal of sourceText.matchAll(stringLiteral)) {
    const offset = literal.index ?? 0;
    if (
      commentRanges.some(([start, end]) => offset >= start && offset < end) ||
      isNativeInternalLogLiteral(sourceText, offset)
    ) {
      continue;
    }
    pushTextViolations(
      violations,
      file,
      sourceText,
      literal[0].slice(1, -1),
      offset + 1,
      'informal-ending',
    );
  }
  violations.push(
    ...findNativeCopyBranchViolations(file, sourceText, commentRanges),
  );
  return violations;
}

function stripNonVisibleDocumentContent(text, extension) {
  let visible = text.replace(/<!--[\s\S]*?-->/gu, '');
  if (extension === '.html') {
    visible = visible
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '')
      .replace(/<[^>]+>/gu, ' ');
  } else if (extension === '.md') {
    visible = visible
      .replace(/```[\s\S]*?```/gu, '')
      .replace(/`[^`]*`/gu, '');
  }
  return visible;
}

export function inspectDocumentCopy(file, sourceText) {
  const visible = stripNonVisibleDocumentContent(sourceText, extname(file));
  return findInformalEndings(visible).map((match) => ({
    file,
    line: lineAt(visible, match.index),
    kind: 'informal-ending',
    excerpt: compact(
      visible.slice(Math.max(0, match.index - 50), match.index + match.text.length + 50),
    ),
    match: match.text,
  }));
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

export function inspectRepositoryCopy(root) {
  const violations = [];
  const sourceRoot = resolve(root, 'src');
  for (const path of listFiles(sourceRoot)) {
    if (!SOURCE_EXTENSIONS.has(extname(path)) || TEST_FILE.test(path)) continue;
    const file = relative(root, path).replaceAll('\\', '/');
    violations.push(...inspectTypeScriptCopy(file, readFileSync(path, 'utf8')));
  }

  const nativeRoot = resolve(
    root,
    'modules',
    'alarmpyo-alarm',
    'android',
    'src',
    'main',
  );
  for (const path of listFiles(nativeRoot)) {
    if (!['.kt', '.java', '.xml'].includes(extname(path))) continue;
    const sourceText = readFileSync(path, 'utf8');
    const file = relative(root, path).replaceAll('\\', '/');
    if (extname(path) === '.xml') {
      violations.push(...inspectDocumentCopy(file, sourceText));
      continue;
    }
    violations.push(...inspectNativeSourceCopy(file, sourceText));
  }

  for (const file of COPY_POLICY_DOCUMENTS) {
    const path = resolve(root, file);
    violations.push(...inspectDocumentCopy(file, readFileSync(path, 'utf8')));
  }
  return violations;
}
