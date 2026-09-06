// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function setupSessionSource() {
  return [
    source('src/features/quick-setup/setup-session-screen.tsx'),
    source('src/features/quick-setup/setup-session-steps.tsx'),
  ].join('\n');
}

describe('통합 근무표 설정 화면 계약', () => {
  it('최초 설정과 재설정은 같은 세션 화면을 사용해요', () => {
    const setup = source('src/app/setup.tsx');
    const quickSetup = source('src/app/quick-setup.tsx');

    expect(setup).toContain('<SetupSessionScreen mode="initial" />');
    expect(quickSetup).toContain('<SetupSessionScreen mode="reconfigure" />');
  });

  it('재설정은 현재 근무표를 보존하고 표준 6종을 네 그룹으로 보여요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('근무표 설정');
    expect(screen).toContain('근무 방식');
    expect(screen).toContain('현재 근무표 사용');
    expect(screen).toContain('직접 설정');
    expect(screen).toContain('파일 불러오기');
    expect(screen).toContain("session.source === 'current'");
    expect(screen).toContain('QUICK_SETUP_GROUPS.map');
    expect(screen).toContain('groupOptions.map');
    expect(screen).toContain('option.detail');
    expect(screen).not.toContain('조 수를 선택합니다');
    expect(screen).not.toContain('<WorkModeStep');
  });

  it('오늘 근무·근무 예시·사용 근무 시간만 한 단계에서 확인해요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain("session.step === 'schedule-anchor'");
    expect(screen).toContain('오늘 근무');
    expect(screen).toContain('근무 예시');
    expect(screen).toContain('<WorkTimeEditor');
    expect(screen).toContain("showDay={activeShiftIds.includes('day')}");
    expect(screen).toContain("showEvening={activeShiftIds.includes('evening')}");
    expect(screen).toContain("showNight={activeShiftIds.includes('night')}");
    expect(screen).not.toContain('근무표 표시 시작일');
    expect(screen).not.toContain('DatePickerField');
    expect(screen).not.toContain("router.push('/shift-settings?focus=time'");
  });

  it('알람은 하나의 토글로 설정하고 시간 충돌 시 수정으로 연결해요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('<ToggleRow');
    expect(screen).toContain('title="근무 알람"');
    expect(screen).toContain('actionLabel="시간 수정"');
    expect(screen).toContain("enabled ? 'prepare' : 'schedule-only'");
    expect(screen).toContain('validation.safety.canEnableAlarms');
    expect(screen).not.toContain('근무표만 저장');
    expect(screen).not.toContain('이대로 사용');
  });

  it('최초·재설정은 store의 단일 setup commit을 사용해요', () => {
    const screen = setupSessionSource();
    const store = source('src/application/runtime/store/commands-coordinator.ts');

    expect(screen).toContain('buildWorkPatternMutation(currentDraft, data.shiftTypes)');
    expect(screen).toContain('await commitSetup({');
    expect(screen).toContain("session.source === 'current'");
    expect(screen).toContain('pattern: data.pattern');
    expect(store).toContain("mode === 'reconfigure'");
    expect(store).toMatch(/await context\.storage\.writeAutomaticBackup\(\s*current\)/);
    expect(store).toContain('notificationsEnabled,');
    expect(store).toContain('primarySaved: result.primarySaved');
    expect(screen).not.toContain('await createBackup();');
    expect(screen).not.toContain('await updatePatternDetailed(');
    expect(screen).not.toContain('await enableAlarms()');
    expect(screen).not.toContain('await disableAlarms()');
    expect(screen).not.toContain('applySharedWorkSettings(');
  });

  it('기존 최초 설정과 간편 설정 초안을 새 세션으로 복원해요', () => {
    const screen = setupSessionSource();
    const model = source(
      'src/features/quick-setup/setup-session-model.ts',
    );
    const repository = source(
      'src/features/quick-setup/quick-setup-draft-repository.ts',
    );

    expect(screen).toContain('migrateQuickSetupDraft({');
    expect(screen).toContain(
      'migrateInitialSetupDraft({',
    );
    expect(model).toContain('export type SetupSessionDraftV2');
    expect(model).toContain("draft.version === 2");
    expect(repository).toContain('SETUP_SESSION_DRAFT_KEY');
    expect(repository).toContain('QUICK_SETUP_DRAFT_KEY');
  });

  it('첫 설정은 오늘부터 시작하고 재설정의 현재 시작일은 보존해요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('resolveSetupScheduleStartDate({');
    expect(screen).toContain("session.source === 'current'");
    expect(screen).not.toContain('<DatePickerField');
    expect(screen).not.toContain('다른 날짜부터 표시');
  });

  it('단계 전환은 TalkBack 제목 초점만 사용해 중복 낭독하지 않아요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('AccessibilityInfo.setAccessibilityFocus(node)');
    expect(screen).not.toContain('AccessibilityInfo.announceForAccessibility');
    expect(screen).toContain('const stepHeadingRef = useRef<Text>(null)');
    const steps = source('src/features/quick-setup/setup-session-steps.tsx');
    expect(steps.match(/accessibilityRole="header" aria-level=\{2\} ref=\{headingRef\}/g)).toHaveLength(3);
    expect(steps).not.toContain('accessible\n        accessibilityLabel="오늘 근무와 시간"');
    expect(screen).toContain('accessibilityRole="progressbar"');
    expect(screen).toContain('accessibilityValue={{ min: 1, max: 3, now: step }}');
  });

  it('320dp와 큰 글자에서 진행·버튼·시간 입력을 세로 배치해요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('width <= 360 || fontScale >= 1.4');
    expect(screen).toContain('width <= 320 || fontScale >= 1.3');
    expect(screen).toContain('styles.footerStacked');
    expect(screen).toContain('styles.previewRowStacked');
    expect(screen).toContain('stackTimeInputs={stackTimeInputs}');
  });

  it('시간 오류는 입력 이탈 또는 다음 동작 후에만 표시해요', () => {
    const screen = setupSessionSource();
    const components = source('src/features/setup/setup-components.tsx');

    expect(screen).toContain('setRevealValidation(true)');
    expect(screen).toContain('revealErrors={revealValidation}');
    expect(components).toContain("touchedFields.has('start')");
    expect(components).toContain("touchedFields.has('end')");
    expect(components).toContain('target.current?.focus()');
  });

  it('저장 안내는 마지막 단계에 한 줄로 표시해요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('설정은 이 기기에 저장됩니다.');
    expect(screen).not.toContain('앱 삭제 시 근무표·메모·설정 삭제');
  });

  it('최초 설정은 장식 배경 없이 저장 진행 상태만 표시해요', () => {
    const screen = setupSessionSource();
    const onboarding = source(
      'src/features/setup/setup-onboarding-surface.tsx',
    );

    expect(screen).not.toContain('SetupBrandHaloBackdrop');
    expect(screen).toContain('<SetupApplyingOverlay visible={busy} />');
    expect(onboarding).not.toContain('LinearGradient');
    expect(onboarding).not.toContain('brandHalo');
    expect(onboarding).toContain('<ActivityIndicator');
  });

  it('기존 긴 근무 순서 편집은 가상화와 단일 선택 상태를 유지해요', () => {
    const components = source('src/features/setup/setup-components.tsx');

    expect(components).toContain('<FlatList');
    expect(components).toContain('accessibilityRole="radiogroup"');
    expect(components).toContain('selected={activeIndex === index}');
    expect(components).not.toContain('선택됨`');
  });

  it('근무표 상세 편집도 공용 mutation과 부분 실패 복구를 유지해요', () => {
    const pattern = source('src/app/pattern.tsx');
    const store = source('src/application/runtime/store/commands-coordinator.ts');

    expect(pattern).toContain('buildWorkPatternMutation');
    expect(pattern).toContain("issue.issueCode === 'alarm-sync-failed'");
    expect(pattern).toContain('resyncAlarms(true)');
    expect(store).toContain('saveOutcome: context.saveOutcomeRef.current');
  });
});
