// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('첫 설정과 근무 시간 편집 계약', () => {
  it('주간 고정에서도 주간 시간을 편집하고 방식 전환 시 입력값을 유지해요', () => {
    const setup = source('src/app/setup.tsx');
    const shiftSettings = source('src/app/shift-settings.tsx');
    const shiftEditor = source(
      'src/features/shift-settings/shift-timing-editor.tsx',
    );

    expect(setup).toContain("showNight={patternKind === 'rotation'}");
    expect(setup).toContain('<WeekdaySchedule dayEnd={dayEnd} dayStart={dayStart} />');
    expect(setup).not.toContain("if (kind === 'weekday')");
    expect(shiftSettings).not.toContain('lockTime=');
    expect(shiftEditor).not.toContain('editable={!lockTime}');
  });

  it('근무 방식만 바꿀 때 저장된 주간 시간을 기본값으로 덮어쓰지 않아요', () => {
    const pattern = source('src/app/pattern.tsx');

    expect(pattern).toContain('const dayShift = data.shiftTypes.find');
    expect(pattern).toContain('formatTimeInput(dayShift.startMinutes)');
    expect(pattern).not.toContain('DAY_SHIFT_START_MINUTES');
    expect(pattern).not.toContain('DAY_SHIFT_END_MINUTES');
  });

  it('알람 권한은 사용자가 선택할 때만 요청하고 건너뛸 수 있다고 안내해요', () => {
    const setup = source('src/app/setup.tsx');

    expect(setup).toContain('useState(false)');
    expect(setup).toContain('if (alarmsWanted)');
    expect(setup).toContain('정확한 알람·일반 알림·전체 화면 알람');
    expect(setup).toContain('지금 건너뛰어도 나중에 알람에서 다시 설정할 수 있어요.');
  });

  it('진입 목적에 맞게 근무 시간과 기상 시간 제목을 구분해요', () => {
    const shiftSettings = source('src/app/shift-settings.tsx');

    expect(shiftSettings).toContain(
      "const screenTitle = focus === 'wake' ? '기상 시간' : '근무 시간';",
    );
    expect(shiftSettings).toContain(
      '<Stack.Screen options={{ title: screenTitle }} />',
    );
    expect(shiftSettings).not.toContain("title: '근무표 설정'");
  });

  it('앱 삭제 위험과 외부 백업 경로를 첫 설정에서 안내해요', () => {
    const setup = source('src/app/setup.tsx');

    expect(setup).toContain('자료는 이 휴대폰에만 저장돼요');
    expect(setup).toContain('앱을 삭제하면 근무표·메모·설정도 함께 사라져요.');
    expect(setup).toContain('설정의 데이터 메뉴에서 백업 파일을 만들어');
  });
});
