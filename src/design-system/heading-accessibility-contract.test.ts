// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('화면 제목 접근성 위계', () => {
  it('글자 크기와 의미 레벨을 분리하고 AppText도 명시한 레벨을 전달합니다', () => {
    const heading = source('src/design-system/heading.tsx');
    const text = source('src/components/ui-kit.tsx');

    expect(heading).toContain('semanticLevel = level');
    expect(heading).toContain('aria-level={semanticLevel}');
    expect(heading).toContain('const levelStyle = level === 1');
    expect(text).toContain("'aria-level'?: 1 | 2 | 3 | 4 | 5 | 6;");
    expect(text).toContain("'aria-level': ariaLevel");
    expect(text).toContain('aria-level={ariaLevel}');
  });

  it('공통 페이지 제목은 H1, 섹션과 설정 그룹은 H2이며 시각 크기는 유지합니다', () => {
    const page = source('src/design-system/page-header.tsx');
    const kit = source('src/components/ui-kit.tsx');
    const section = kit.slice(kit.indexOf('export function SectionHeader'), kit.indexOf('export function IconTile'));
    const menu = kit.slice(kit.indexOf('export function MenuGroup'), kit.indexOf('export function MenuDivider'));

    expect(page).toContain('level={2} semanticLevel={1}');
    expect(section.match(/<Heading level=\{3\} semanticLevel=\{2\}/g)).toHaveLength(4);
    expect(menu).toMatch(/accessibilityRole="header"\s+aria-level=\{2\}/);
  });

  it('첫 설정은 화면 H1, 단계 H2, 단계 내 예시와 시간 H3를 유지합니다', () => {
    const screen = source('src/features/quick-setup/setup-session-screen.tsx');
    const steps = source('src/features/quick-setup/setup-session-steps.tsx');

    expect(screen).toMatch(/accessibilityRole="header" aria-level=\{1\} variant="heading">\s*근무표 설정/);
    for (const label of ['근무 순서 선택', '오늘 근무와 시간', '알람 준비']) {
      expect(steps).toContain(`accessibilityLabel="${label}" accessibilityRole="header" aria-level={2} ref={headingRef}`);
    }
    expect(steps.match(/accessibilityRole="header" aria-level=\{3\}/g)).toHaveLength(3);
    expect(steps).not.toContain('aria-level={1}');
  });

  it('Today는 날짜 H1, 카드와 일정 H2, 일정 안 수면과 루틴 H3입니다', () => {
    expect(source('src/app/(tabs)/index.tsx')).toMatch(/accessibilityRole="header"\s+aria-level=\{1\}/);
    expect(source('src/features/today/today-hero.tsx')).toMatch(/accessibilityRole="header"\s+aria-level=\{2\}/);
    expect(source('src/features/today/today-guidance-section.tsx')).toContain('<SectionHeader centered title="오늘 일정" />');
    expect(source('src/components/sleep-timing-card.tsx')).toContain('accessibilityRole="header" aria-level={3}');
    expect(source('src/components/work-routine-panel.tsx')).toContain('accessibilityRole="header" aria-level={3}');
  });

  it('타이머 본문은 H2, 별도 직접 입력 모달은 자체 H1을 제공합니다', () => {
    expect(source('src/app/(tabs)/timer.tsx')).toContain('accessibilityRole="header" aria-level={2} style={styles.centerText}');
    expect(source('src/features/timer/quick-timer-duration-stepper.tsx')).toMatch(/accessibilityRole="header"\s+aria-level=\{1\}\s+style=\{styles.headerTitle\}/);
  });

  it('달력은 화면 H1, 월 H2, 큰 글자 주차 목록 H3입니다', () => {
    expect(source('src/features/calendar/calendar-screen-header.tsx')).toContain('accessibilityRole="header" aria-level={1}');
    expect(source('src/features/calendar/calendar-month-card.tsx')).toContain('accessibilityRole="header" aria-level={2}');
    expect(source('src/features/calendar/calendar-week-list.tsx')).toMatch(/accessibilityRole="header"\s+aria-level=\{3\}/);
  });
});

describe('토글 행의 단일 접근성 노드', () => {
  it('부모 행만 이름·선택 상태·활성화를 제공하고 네이티브 스위치는 장식으로 유지합니다', () => {
    const toggle = source('src/design-system/toggle-row.tsx');
    const child = toggle.slice(toggle.indexOf('<Switch'), toggle.indexOf('/>', toggle.indexOf('<Switch')));

    expect(toggle.match(/accessibilityRole="switch"/g)).toHaveLength(1);
    expect(toggle).toContain('accessibilityState={{ checked: value, disabled }}');
    expect(toggle).toContain('onPress={() => onValueChange(!value)}');
    expect(toggle).toContain("{...(Platform.OS === 'web' ? { inert: true } : {})}");
    expect(toggle).toMatch(/accessibilityElementsHidden\s+aria-hidden\s+importantForAccessibility="no-hide-descendants"\s+pointerEvents="none"/);
    expect(child).toContain('accessible={false}');
    expect(child).toContain('aria-hidden');
    expect(child).toContain('importantForAccessibility="no"');
    expect(child).toContain('focusable={false}');
    expect(child).toContain('tabIndex={-1}');
    expect(child).toContain('onValueChange={onValueChange}');
    expect(child).toContain('value={value}');
  });
});
