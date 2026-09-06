// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('전역 Play 업데이트 화면 계약', () => {
  it('시작 전환 뒤 루트에서 모든 화면보다 앞선 중앙 모달을 제공합니다', () => {
    const root = source('src/app/_layout.tsx');
    const provider = source(
      'src/features/update/global-play-update-controller.tsx',
    );
    const modalSurface = source('src/design-system/modal-surface.tsx');
    const appDialog = source('src/components/app-dialog.tsx');

    expect(root).toContain('updateNoticeEnabled={!launchVisible}');
    expect(root).toContain('<GlobalPlayUpdateProvider');
    expect(provider).toContain('<ModalSurface');
    expect(modalSurface).toContain('presentationStyle="overFullScreen"');
    expect(modalSurface).toContain('accessibilityViewIsModal');
    expect(modalSurface).toContain("justifyContent: 'center'");
    expect(modalSurface).toContain(
      'Math.min(520, Math.max(0, width - horizontalGuard * 2))',
    );
    expect(modalSurface).toContain(
      'Math.max(insets.left, insets.right, space.lg)',
    );
    expect(modalSurface).toContain('zIndex: 10_000');
    expect(modalSurface).toContain('elevation: 48');
    expect(provider).toContain(
      'setPriorityModalVisible(PLAY_UPDATE_PRIORITY_MODAL_OWNER, modalVisible)',
    );
    expect(appDialog).toContain(
      'priorityModalOwners.size > 0 ? null : request',
    );
  });

  it('업데이트 실행은 렌더 상태가 아닌 revision 잠금으로 직렬화합니다', () => {
    const provider = source(
      'src/features/update/global-play-update-controller.tsx',
    );

    expect(provider).toContain('const revision = actionGate.claim()');
    expect(provider).toContain('actionGate.isCurrent(revision)');
    expect(provider).toContain('actionGate.release(revision)');
    expect(provider).not.toContain('if (busy) return;');
  });

  it('중앙 알림과 다운로드 이후 비차단 상태 표시를 분리합니다', () => {
    const provider = source(
      'src/features/update/global-play-update-controller.tsx',
    );
    expect(provider).toContain('label="24시간 후 다시 알림"');
    expect(provider).toContain('<PlayUpdateStatusBar');
    expect(provider).toContain('getPlayUpdateStatusBarPresentation');
    expect(provider).toContain("'progressbar'");
    expect(provider).toContain('accessibilityLiveRegion="none"');
    expect(provider).toContain('resolveFloatingTabBarLayout');
    expect(provider).toContain('resolveFloatingTabBarGeometry');
    expect(provider).toMatch(
      /kind === null\s*\|\|\s*kind === 'available'/,
    );
    expect(provider).toContain('shouldPresentPlayUpdateStatusBar(status, snooze, now)');
    expect(provider).toContain('GlobalBottomOverlayLayoutContext.Provider');
    expect(provider).toContain('registerBottomControlInset');
    expect(provider).toContain("presentation.actionLabel ? 'box-none' : 'none'");
    expect(provider).toContain('actionFocus.focusVisible');
  });

  it('공통 Screen이 상태 바와 footer 높이를 콘텐츠 여백에 반영합니다', () => {
    const screen = source('src/components/ui-kit.tsx');
    const layout = source('src/components/global-bottom-overlay-layout.tsx');
    expect(screen).toContain('useGlobalBottomOverlayLayout()');
    expect(screen).toContain('registerBottomControlInset(footerOwner, footerInset)');
    expect(screen).toContain('resolveScreenContentBottomInset({');
    expect(screen).toContain('onLayout={measureFooter}');
    expect(layout).toContain('contentInset: number');
  });

  it('Play 흐름을 열기 전에 같은 버전의 중앙 안내를 처리합니다', () => {
    const provider = source(
      'src/features/update/global-play-update-controller.tsx',
    );
    const actionStart = provider.indexOf("if (kind === 'available')");
    const snooze = provider.indexOf('await snoozeFor24Hours()', actionStart);
    const playStart = provider.indexOf('await startFlexiblePlayUpdate()', actionStart);
    expect(actionStart).toBeGreaterThan(-1);
    expect(snooze).toBeGreaterThan(actionStart);
    expect(playStart).toBeGreaterThan(snooze);
    expect(provider).toContain(').catch(() => undefined);');
  });

  it('Today의 기존 배너를 제거하고 설정 두 단계에 상태 배지를 유지합니다', () => {
    const today = source('src/app/(tabs)/index.tsx');
    const settings = source('src/components/settings-home.tsx');
    const management = source('src/app/app-management.tsx');
    expect(today).not.toContain('PlayUpdateBanner');
    expect(settings).toContain('<PlayUpdateStatusBadge');
    expect(management).toContain('<PlayUpdateStatusBadge');
  });

  it('전체 초기화 저널이 AppData 밖의 24시간 미루기 상태도 정리합니다', () => {
    const adapter = source('src/infrastructure/runtime/native-app-store-engine.ts');
    const boot = source('src/application/runtime/store/boot-coordinator.ts');
    const restore = source('src/application/runtime/store/restore-coordinator.ts');
    expect(adapter).toContain('clearPlayUpdatePromptSnooze(runtime.dataRepository)');
    expect(restore).toContain('context.platform.clearPlayUpdatePromptSnooze()');
    expect(boot).toContain('clearDeviceLocalData: operations.clearDeviceLocalDataForResetCleanup');
    expect(restore).toContain(
      'clearDeviceLocalData: operations.clearDeviceLocalDataForResetCleanup',
    );
    expect(adapter).toContain('clearQuickSetupDraft(runtime.dataRepository)');
    expect(restore).toContain('context.platform.clearQuickSetupDraft()');
  });
});
