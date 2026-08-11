// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dayAlarmComponent = readFileSync(
  resolve(process.cwd(), 'src/features/day-editor/day-alarm-summary.tsx'),
  'utf8',
);
const dayEditor = readFileSync(
  resolve(process.cwd(), 'src/app/day/[date].tsx'),
  'utf8',
);

describe('하루 알람 설정 UI 계약', () => {
  it('기본값, 이날만 끄기, 기상 시각을 한 선택 그룹으로 제공해요', () => {
    expect(dayAlarmComponent).toContain("{ label: '기본값', value: 'default' }");
    expect(dayAlarmComponent).toContain("{ label: '이날만 끄기', value: 'disabled' }");
    expect(dayAlarmComponent).toContain("{ label: '기상 시각', value: 'wake-time' }");
    expect(dayAlarmComponent).toContain('label="이 날짜의 근무 알람 방식"');
  });

  it('전날과 당일을 라디오 선택으로 명확하게 구분해요', () => {
    expect(dayAlarmComponent).toContain('accessibilityRole="radiogroup"');
    expect(dayAlarmComponent).toContain('accessibilityRole="radio"');
    expect(dayAlarmComponent).toContain('formatWakeDayLabel');
  });

  it('좁은 화면과 큰 글자에서는 선택 항목을 세로로 배치해요', () => {
    expect(dayAlarmComponent).toContain("layout={compact ? 'stacked' : 'auto'}");
    expect(dayAlarmComponent).toContain('accessibilityLiveRegion="polite"');
  });

  it('하루 일정과 날짜별 알람을 하나의 저장 호출로 전달해요', () => {
    expect(dayEditor).toContain('alarmOverrideForSave,');
    expect(dayEditor).toContain('const saved = await saveDay(');
    expect(dayEditor).not.toContain('setDayAlarmOverride(');
  });
});
