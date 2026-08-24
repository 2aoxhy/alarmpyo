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

  it('재설정은 현재 근무표를 기본으로 두고 선택·직접 만들기·파일 순서로 보여요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('근무표 설정');
    expect(screen).toContain('근무 순서 선택');
    expect(screen).toContain('현재 근무표 사용');
    expect(screen).toContain('직접 만들기');
    expect(screen).toContain('파일 불러오기');
    expect(screen).toContain("session.source === 'current'");
    expect(screen).toContain('QUICK_SETUP_OPTIONS.map');
    expect(screen).not.toContain('option.detail');
    expect(screen).not.toContain('조 수를 선택합니다');
    expect(screen).not.toContain('<WorkModeStep');
  });

  it('오늘 근무·7일 미리보기·인라인 시간을 한 단계에서 확인해요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain("session.step === 'schedule-anchor'");
    expect(screen).toContain('오늘 근무 선택');
    expect(screen).toContain('앞으로 7일');
    expect(screen).toContain('<WorkTimeEditor');
    expect(screen).toContain("showDay={activeShiftIds.includes('day')}");
    expect(screen).toContain("showEvening={activeShiftIds.includes('evening')}");
    expect(screen).toContain("showNight={activeShiftIds.includes('night')}");
    expect(screen).not.toContain("router.push('/shift-settings?focus=time'");
  });

  it('알람 충돌은 시간 조정과 알람 없이 저장을 명시적으로 나눠요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('알람 시간 조정');
    expect(screen).toContain('근무표만 저장하고 알람 끄기');
    expect(screen).toContain("onSelectAlarmChoice('schedule-only')");
    expect(screen).toContain('validation.safety.canEnableAlarms');
    expect(screen).not.toContain('이대로 사용');
  });

  it('최초 설정은 한 번의 원자적 저장을 사용하고 재설정은 안전 백업을 만들어요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('buildWorkPatternMutation(currentDraft, data.shiftTypes)');
    expect(screen).toContain('completeInitialSetup({');
    expect(screen).toContain('await createBackup();');
    expect(screen).toContain('await updatePatternDetailed(');
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
      'migrateInitialSetupDraft({ data: initialData, draft: legacy })',
    );
    expect(model).toContain('export type SetupSessionDraftV2');
    expect(model).toContain("draft.version === 2");
    expect(repository).toContain('SETUP_SESSION_DRAFT_KEY');
    expect(repository).toContain('QUICK_SETUP_DRAFT_KEY');
  });

  it('날짜 직접 입력은 화면에 보관하고 유효한 날짜만 재개 초안에 반영해요', () => {
    const screen = setupSessionSource();
    const nativeDatePicker = source('src/components/date-picker-field.tsx');
    const webDatePicker = source('src/components/date-picker-field.web.tsx');

    expect(screen).toContain('bufferManualInput');
    expect(screen).toContain('createSetupReferenceDatePatch({');
    expect(screen).toContain('if (patch) patchSession(patch);');
    for (const datePicker of [nativeDatePicker, webDatePicker]) {
      expect(datePicker).toContain('const [manualDraft, setManualDraft]');
      expect(datePicker).toContain('createCompactDateInputUpdate(nextValue)');
      expect(datePicker).toContain('if (update.dateKey && update.dateKey !== value)');
    }
  });

  it('단계 전환은 TalkBack 초점과 한 번의 단계 안내를 사용해요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('AccessibilityInfo.setAccessibilityFocus(node)');
    expect(screen).toContain('AccessibilityInfo.announceForAccessibility(label)');
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

  it('앱 삭제 위험과 외부 백업 경로를 마지막 단계에 표시해요', () => {
    const screen = setupSessionSource();

    expect(screen).toContain('기기 저장');
    expect(screen).toContain('앱 삭제 시 근무표·메모·설정 삭제');
    expect(screen).toContain('데이터 메뉴에서 외부 백업 가능');
  });

  it('최초 설정의 브랜드 배경과 저장 진행 상태를 유지해요', () => {
    const screen = setupSessionSource();
    const onboarding = source(
      'src/features/setup/setup-onboarding-surface.tsx',
    );

    expect(screen).toContain("mode === 'initial' ? <SetupBrandHaloBackdrop />");
    expect(screen).toContain('<SetupApplyingOverlay visible={busy} />');
    expect(onboarding).toContain('export function SetupBrandHaloBackdrop()');
    expect(onboarding).not.toContain('filter: [{ blur:');
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
    const store = source('src/store/app-store.tsx');

    expect(pattern).toContain('buildWorkPatternMutation');
    expect(pattern).toContain("issue.issueCode === 'alarm-sync-failed'");
    expect(pattern).toContain('resyncAlarms(true)');
    expect(store).toContain('saveOutcome: saveOutcomeRef.current');
  });
});
