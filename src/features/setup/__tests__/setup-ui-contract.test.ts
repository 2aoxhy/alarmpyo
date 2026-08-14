// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('첫 설정과 근무 시간 편집 계약', () => {
  it('첫 화면은 네 분류만 보여주고 2·3교대의 조 수를 나중에 선택해요', () => {
    const components = source('src/features/setup/setup-components.tsx');
    const patterns = source('src/utils/work-pattern.ts');

    expect(components).toContain('WORK_PATTERN_CATEGORIES.map');
    expect(components).toContain("categoryId === 'two-shift' || categoryId === 'three-shift'");
    expect(components).toContain('조 수를 선택해요');
    expect(patterns).toContain("name: '주간 고정'");
    expect(patterns).toContain("name: '2교대'");
    expect(patterns).toContain("name: '3교대'");
    expect(patterns).toContain("name: '기타'");
  });

  it('주간 고정에서도 주간 시간을 편집하고 방식 전환 시 입력값을 유지해요', () => {
    const setup = source('src/app/setup.tsx');
    const shiftSettings = source('src/app/shift-settings.tsx');
    const shiftEditor = source(
      'src/features/shift-settings/shift-timing-editor.tsx',
    );

    expect(setup).toContain("showDay={validation.activeShiftIds.includes('day')}");
    expect(setup).toContain("showEvening={validation.activeShiftIds.includes('evening')}");
    expect(setup).toContain("showNight={validation.activeShiftIds.includes('night')}");
    expect(setup).toContain('<WeekdaySchedule dayEnd={dayEnd} dayStart={dayStart} />');
    expect(setup).toContain('<PatternSequenceEditor sequence={sequence}');
    expect(shiftSettings).not.toContain('lockTime=');
    expect(shiftEditor).not.toContain('editable={!lockTime}');
  });

  it('근무 방식만 바꿀 때 저장된 주간 시간을 기본값으로 덮어쓰지 않아요', () => {
    const pattern = source('src/app/pattern.tsx');

    expect(pattern).toContain('<PatternSequenceEditor sequence={sequence}');
    expect(pattern).not.toContain('setDayStart');
    expect(pattern).not.toContain('startMinutes:');
    expect(pattern).not.toContain('DAY_SHIFT_START_MINUTES');
    expect(pattern).not.toContain('DAY_SHIFT_END_MINUTES');
  });

  it('손대지 않은 시간에만 프리셋 대표 시간을 적용하고 회사 시간 확인을 요구해요', () => {
    const setup = source('src/app/setup.tsx');

    expect(setup).toContain('applySetupPresetSuggestions({');
    expect(setup).toContain('editedFields: editedWorkTimeFields');
    expect(setup).toContain('getSuggestedWorkTimesForPreset(nextPresetId)');
    expect(setup).toContain("markWorkTimeEdited('dayStart')");
    expect(setup).toContain('이 시간이 맞아요');
    expect(setup).toContain('대표 예시이며 회사 시간에 맞게 변경해 주세요.');
  });

  it('주간 고정과 같은 사용자 순서를 요일 기준으로 전환한다고 안내해요', () => {
    const setup = source('src/app/setup.tsx');
    const pattern = source('src/app/pattern.tsx');

    expect(setup).toContain('validation.normalizedToWeekday');
    expect(setup).toContain("validation.effectivePresetId !== 'weekday'");
    expect(setup).toContain('입력한 순서는 주간 고정과 같아');
    expect(pattern).toContain('normalizedToWeekday');
    expect(pattern).toContain("effectivePresetId !== 'weekday'");
    expect(pattern).toContain('이 순서는 주간 고정과 같아');
  });

  it('알람 권한은 안전한 일정에서 사용자가 선택할 때만 요청해요', () => {
    const setup = source('src/app/setup.tsx');

    expect(setup).toContain('useState(false)');
    expect(setup).toContain('if (effectiveAlarmsWanted)');
    expect(setup).toContain('disabled={!scheduleSafety.canEnableAlarms}');
    expect(setup).toContain('safetyResult: scheduleSafety');
    expect(setup).toContain('!scheduleSafety.canSave');
    expect(setup).toContain('지금 건너뛰어도 설정의 알람에서 나중에 켤 수 있어요.');
  });

  it('진입 목적에 맞게 근무 시간과 기상 시간 제목을 구분해요', () => {
    const shiftSettings = source('src/app/shift-settings.tsx');

    expect(shiftSettings).toContain("focus === 'wake'");
    expect(shiftSettings).toContain("? '기상 시간'");
    expect(shiftSettings).toContain("focus === 'time'");
    expect(shiftSettings).toContain("? '근무 시간'");
    expect(shiftSettings).toContain(": '근무표 설정';");
    expect(shiftSettings).toContain(
      '<Stack.Screen options={{ title: screenTitle }} />',
    );
  });

  it('앱 삭제 위험과 외부 백업 경로를 첫 설정에서 안내해요', () => {
    const setup = source('src/app/setup.tsx');

    expect(setup).toContain('자료는 이 휴대폰에만 저장돼요');
    expect(setup).toContain('앱을 삭제하면 근무표·메모·설정도 함께 사라져요.');
    expect(setup).toContain('설정 후 데이터 메뉴에서 외부 백업을 만들 수 있어요.');
  });
});
