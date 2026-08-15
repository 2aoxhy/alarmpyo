import { describe, expect, it } from 'vitest';

import {
  findInformalEndings,
  inspectDocumentCopy,
  inspectNativeSourceCopy,
  inspectTypeScriptCopy,
} from '../copy-policy.mjs';

describe('사용자 문구 정책', () => {
  it('안내·질문·요청의 해요체 종결을 찾습니다', () => {
    expect(
      findInformalEndings(
        '자료가 있어요. 저장해 주세요. 이 설정을 적용할까요? 먼저 확인해야 해요. 파일이 너무 커요. 오류를 펼쳐요.',
      ).map(({ text }) => text),
    ).toEqual(['있어요', '주세요', '적용할까요', '해요', '커요', '펼쳐요']);
  });

  it('합니다체와 짧은 행동명은 허용합니다', () => {
    expect(
      findInformalEndings('자료가 있습니다. 설정을 확인해야 합니다. 저장'),
    ).toEqual([]);
  });

  it('TypeScript 주석은 제외하고 문자열과 JSX 문구를 검사합니다', () => {
    const source = `
      // 이 주석은 검사하지 않아요.
      const message = '자료를 저장했어요.';
      const view = <Text>설정을 확인해 주세요.</Text>;
    `;
    expect(
      inspectTypeScriptCopy('sample.tsx', source)
        .filter(({ kind }) => kind === 'informal-ending')
        .map(({ match }) => match),
    ).toEqual(['저장했어요', '주세요']);
  });

  it('내부 로그 문구는 TypeScript와 네이티브 소스에서 제외합니다', () => {
    const typeScriptSource = [
      "console.warn('로그에서는 확인해요.');",
      "const message = '화면에서는 확인해요.';",
    ].join('\n');
    expect(
      inspectTypeScriptCopy('sample.ts', typeScriptSource)
        .filter(({ kind }) => kind === 'informal-ending')
        .map(({ match }) => match),
    ).toEqual(['확인해요']);

    const nativeSource = [
      'Log.e(TAG, "로그에서는 확인해요.")',
      '// "주석에서는 안내해요."',
      'val userMessage = "화면에서는 확인해요."',
    ].join('\n');
    expect(
      inspectNativeSourceCopy('sample.kt', nativeSource).map(
        ({ match }) => match,
      ),
    ).toEqual(['확인해요']);
  });

  it('템플릿의 head·middle·tail과 JSX 전체의 문구를 검사합니다', () => {
    const source = [
      'const message = `먼저 확인해요 ${name} 다음은 반복해요 ${count} 모두 끝났어요`;',
      'const view = (',
      '  <Text accessibilityHint="설정을 확인하세요">',
      '    화면을 선택했어요 {" 준비해야 해요"}',
      '  </Text>',
      ');',
      '// 주석의 해요체는 검사하지 않아요.',
    ].join('\n');

    expect(
      inspectTypeScriptCopy('sample.tsx', source)
        .filter(({ kind }) => kind === 'informal-ending')
        .map(({ match }) => match),
    ).toEqual([
      '확인해요',
      '반복해요',
      '끝났어요',
      '확인하세요',
      '선택했어요',
      '해요',
    ]);
  });

  it('표시 문구를 비교하여 동작을 정하는 코드를 거부합니다', () => {
    const source = `
      export function iconForLabel(label: string) {
        return label.includes('저장 완료') ? 'check' : 'info';
      }
    `;
    expect(inspectTypeScriptCopy('sample.ts', source)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'copy-driven-branch' }),
      ]),
    );
  });

  it('표시 문구 switch로 동작을 정하는 코드를 거부합니다', () => {
    const source = `
      export function iconForLabel(label: string) {
        switch (label) {
          case '저장 완료':
            return 'check';
          default:
            return 'info';
        }
      }
    `;
    expect(inspectTypeScriptCopy('sample.ts', source)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'copy-driven-branch' }),
      ]),
    );
  });

  it('shiftName과 오류 문구의 한국어 비교를 거부합니다', () => {
    const source = `
      const kind = alarm.shiftName === '교육' ? 'training' : 'day';
      const duration = alarm.shiftName.startsWith('60') ? 60 : 30;
      const safeMessage = /[가-힣]/.test(error.message) ? error.message : fallback;
      const protocol = /^AlarmPyo-/.test(fileName);
      const holiday = holiday.name.startsWith('대체공휴일');
    `;
    expect(
      inspectTypeScriptCopy('sample.ts', source).filter(
        ({ kind }) => kind === 'copy-driven-branch',
      ),
    ).toHaveLength(4);
  });

  it('네이티브의 name 검색과 label when 분기를 거부합니다', () => {
    const source = [
      'val visual = alarm.shiftName.contains("야간")',
      'val duration = alarm.shiftName.startsWith("60")',
      'val compact = when (label) {',
      '  "다음 근무" -> "다음"',
      '  else -> label',
      '}',
      '// 주석의 shiftName.contains("교육")은 검사하지 않습니다.',
      'Log.d(TAG, "label == 다음 알람")',
    ].join('\n');
    expect(
      inspectNativeSourceCopy('sample.kt', source).filter(
        ({ kind }) => kind === 'copy-driven-branch',
      ),
    ).toHaveLength(3);
  });

  it('HTML의 코드와 스타일을 제외한 실제 본문을 검사합니다', () => {
    const source = `
      <style>.note::after { content: '알려드려요'; }</style>
      <p>자료를 전송하지 않아요.</p>
    `;
    expect(inspectDocumentCopy('privacy.html', source)).toEqual([
      expect.objectContaining({ match: '않아요' }),
    ]);
  });
});
