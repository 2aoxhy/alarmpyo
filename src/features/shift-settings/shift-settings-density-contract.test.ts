// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const shiftSettings = readFileSync(
  resolve(process.cwd(), 'src/app/shift-settings.tsx'),
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
    expect(shiftSettings).toContain(
      "focus === 'wake' ? 'routine' : focus === 'time' ? 'time' : null",
    );
  });
});
