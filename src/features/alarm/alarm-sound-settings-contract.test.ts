// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('시스템 알람음 설정 화면 계약', () => {
  const component = source(
    'src/features/alarm/alarm-sound-settings.tsx',
  );

  it('알람 설정 화면에서 독립된 알람음 설정을 제공해요', () => {
    const alarmSettings = source('src/app/alarm-settings.tsx');

    expect(alarmSettings).toContain(
      'import { AlarmSoundSettings } from "@/features/alarm/alarm-sound-settings";',
    );
    expect(alarmSettings).toContain('<AlarmSoundSettings />');
    expect(component).toContain('알람음·진동');
    expect(component).toContain(
      '모든 근무·타이머·시험 알람에 알람음과 진동을 함께 적용해요.',
    );
    expect(component).toContain('현재 알람음');
  });

  it('구버전과 웹에서는 숨기고 화면 이탈 시 미리 듣기를 중지해요', () => {
    expect(component).toContain("Platform.OS === 'android'");
    expect(component).toContain('isAlarmSoundSelectionSupported()');
    expect(component).toContain('if (!supported');
    expect(component).toContain('useFocusEffect(');
    expect(component).toContain('stopAlarmSoundPreview()');
    expect(component).toContain('PREVIEW_DURATION_MS = 10_000');
  });

  it('선택·미리 듣기·조건부 기본값 복원을 AppButton으로 제공해요', () => {
    expect(component).toContain('label="시스템 알람음 선택하기"');
    expect(component).toContain("previewing ? '미리 듣기 중지' : '10초 미리 듣기'");
    expect(component).toContain('{status.selected ? (');
    expect(component).toContain('label="기본값 복원"');
    expect(component).toContain('stackActions && styles.actionRowStacked');
  });
});
