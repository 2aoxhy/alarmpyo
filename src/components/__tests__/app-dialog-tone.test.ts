// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_APP_DIALOG_BUTTONS,
  DEFAULT_APP_DIALOG_OPTIONS,
} from '../app-dialog-contract';
import { resolveAppDialogPresentation } from '../app-dialog-tone';

describe('앱 팝업 색상', () => {
  const dialogSource = readFileSync(
    resolve(process.cwd(), 'src/components/app-dialog.tsx'),
    'utf8',
  );

  it('명시한 성공 의미를 성공 표현으로 표시합니다', () => {
    expect(resolveAppDialogPresentation('success')).toEqual({
      icon: 'checkmark-circle',
      paletteRole: 'mintDark',
    });
  });

  it('제목 문구와 무관하게 명시한 위험 의미를 유지합니다', () => {
    expect(resolveAppDialogPresentation('danger')).toEqual({
      icon: 'alert-circle-outline',
      paletteRole: 'danger',
    });
  });

  it('기본 확인 팝업도 문구나 파괴적 버튼에서 의미를 추론하지 않습니다', () => {
    expect(DEFAULT_APP_DIALOG_OPTIONS).toEqual({ tone: 'neutral' });
    expect(DEFAULT_APP_DIALOG_BUTTONS).toEqual([
      {
        actionId: 'confirm',
        icon: 'checkmark',
        text: '확인',
      },
    ]);
    expect(dialogSource).toContain('request?.options.tone');
    expect(dialogSource).not.toContain('hasDestructiveAction');
    expect(dialogSource).not.toContain("button.style === 'destructive' ? 'danger'");
  });

  it('사용자 지정 버튼에는 명시적인 팝업 의미를 타입으로 요구합니다', () => {
    expect(dialogSource).toContain('buttons: AppDialogButton[],');
    expect(dialogSource).toContain('options: AppDialogOptions,');
    expect(dialogSource).toContain('showDialog: ShowAppDialog');
  });
});
