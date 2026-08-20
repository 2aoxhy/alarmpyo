// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const shiftSettings = readFileSync(
  resolve(process.cwd(), 'src/app/shift-settings.tsx'),
  'utf8',
);
const shiftTimingEditor = readFileSync(
  resolve(
    process.cwd(),
    'src/features/shift-settings/shift-timing-editor.tsx',
  ),
  'utf8',
);

describe('근무표 설정 요약 허브 계약', () => {
  it('근무 방식·시간·루틴을 요약하고 동시에 하나만 열어요', () => {
    for (const panel of ['pattern', 'time', 'routine']) {
      expect(shiftSettings).toContain(`activePanel === '${panel}'`);
      expect(shiftSettings).toContain(`togglePanel('${panel}')`);
    }
    expect(shiftSettings).toContain(
      'setActivePanel((current) => (current === panel ? null : panel))',
    );
    expect(shiftSettings).toContain('showDisclosure={false}');
    expect(shiftSettings).toContain('visibleSection="time"');
    expect(shiftSettings).toContain('visibleSection="wake"');
  });

  it('일반 진입에서는 모두 접고 시간·기상 딥링크만 해당 편집을 열어요', () => {
    expect(shiftSettings).toContain("focus === 'wake' ? 'routine'");
    expect(shiftSettings).toContain("focus === 'time' ? 'time'");
    expect(shiftSettings).toContain('useState(focusedPanel === null)');
    expect(shiftSettings).toContain("label=\"전체 설정 보기\"");
    expect(shiftSettings).toContain("focusedPanel === 'time' ? timeEditor");
    expect(shiftSettings).toContain("focusedPanel === 'routine' ? routineEditor");
  });

  it('직접 진입에서는 반복되는 편집기 제목을 숨겨 핵심 설정부터 보여줘요', () => {
    expect(shiftSettings).toContain('showHeader={showAllSettings}');
    expect(shiftSettings).toContain('필요한 항목만 열어 수정합니다.');
    expect(shiftSettings).toContain(
      '주대와 야대는 각각 주간과 야간의 기상·출근 설정을 사용합니다.',
    );
  });

  it('기상 시각을 원자 텍스트로 표시하고 큰 글자에서는 한 열로 바꿔요', () => {
    expect(shiftTimingEditor).toContain('numberOfLines={1}');
    expect(shiftTimingEditor).toContain(
      'stackAlarmOptions ? undefined : 1.2',
    );
    expect(shiftTimingEditor).toContain(
      'resolveWakeTimeOptionColumns(width, fontScale) === 1',
    );
    expect(shiftTimingEditor).toContain('showCheck={false}');
    expect(shiftTimingEditor).toContain('selected={selected}');
    expect(shiftTimingEditor).toContain(
      'accessibilityLabel={`${optionTime',
    );
    expect(shiftTimingEditor).not.toContain('선택됨');
    expect(shiftTimingEditor).toContain(
      '<SelectionIndicator selected={selected} />',
    );
    expect(shiftTimingEditor).toContain("flexBasis: '46%'");
  });
});
