// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const todayScreen = readFileSync(
  resolve(process.cwd(), 'src/app/(tabs)/index.tsx'),
  'utf8',
);
const todayGuidance = readFileSync(
  resolve(process.cwd(), 'src/features/today/today-guidance-section.tsx'),
  'utf8',
);
const alarmSettings = readFileSync(
  resolve(process.cwd(), 'src/app/alarm-settings.tsx'),
  'utf8',
);

describe('날짜별 알람 표시 계약', () => {
  it('오늘 화면은 다음 알람의 날짜별 설정을 자료에서 직접 확인해요', () => {
    expect(todayScreen).toContain(
      "data.alarmOverrides[viewModel.scheduledAlarms[0].dateKey]?.mode",
    );
    expect(todayGuidance).toContain('이날만 설정');
    expect(todayGuidance).toContain('alarmHasDateOverride');
  });

  it('알람 화면의 다음 알람과 펼친 일정 모두 날짜별 설정을 표시해요', () => {
    expect(alarmSettings).toContain('hasDateOverride={Boolean(');
    expect(alarmSettings).toContain('data.alarmOverrides[alarm.dateKey]?.mode');
    expect(alarmSettings.match(/이날만 설정/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
