export type CopyKind =
  | 'sentence'
  | 'requirement'
  | 'question'
  | 'action'
  | 'label'
  | 'badge'
  | 'a11yLabel'
  | 'a11yHint';

export type CopyEntry<Kind extends CopyKind = CopyKind> = Readonly<{
  kind: Kind;
  text: string;
}>;

/**
 * 사용자 문구의 역할을 문자열과 함께 보존합니다.
 * 문구 역할은 화면 동작을 추론하는 데 사용하지 않습니다.
 */
export function defineCopy<Kind extends CopyKind>(
  kind: Kind,
  text: string,
): CopyEntry<Kind> {
  return Object.freeze({ kind, text });
}

export function defineCopyCatalog<
  const Catalog extends Readonly<Record<string, CopyEntry>>,
>(catalog: Catalog): Catalog {
  return Object.freeze(catalog);
}
