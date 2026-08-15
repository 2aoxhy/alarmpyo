// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { alarmCopy } from './alarm-copy';
import { commonCopy } from './common-copy';
import type { CopyEntry, CopyKind } from './copy-contract';
import { dataCopy } from './data-copy';
import { updateCopy } from './update-copy';

function expectKinds<Catalog extends Readonly<Record<string, CopyEntry>>>(
  catalog: Catalog,
  expected: Readonly<Record<keyof Catalog, CopyKind>>,
) {
  expect(
    Object.fromEntries(
      Object.entries(catalog).map(([key, entry]) => [key, entry.kind]),
    ),
  ).toEqual(expected);
}

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('사용자 문구 카탈로그', () => {
  it('공통 문구의 역할을 타입과 함께 보존합니다', () => {
    expectKinds(commonCopy, {
      confirm: 'action',
      cancel: 'action',
      save: 'action',
      retry: 'action',
      openSettings: 'action',
      closeDialogLabel: 'a11yLabel',
      providerUnavailable: 'sentence',
    });
  });

  it('알람 문구의 역할을 타입과 함께 보존합니다', () => {
    expectKinds(alarmCopy, {
      permissionRequired: 'requirement',
      ready: 'sentence',
      unavailable: 'sentence',
      openSettings: 'action',
      testAlarm: 'action',
    });
  });

  it('자료 문구의 역할을 타입과 함께 보존합니다', () => {
    expectKinds(dataCopy, {
      saveComplete: 'sentence',
      saveFailed: 'sentence',
      invalidSchedule: 'requirement',
      restoreQuestion: 'question',
      managementSummary: 'label',
      backupSection: 'label',
      backup: 'action',
      restore: 'action',
    });
  });

  it('업데이트 문구의 역할을 타입과 함께 보존합니다', () => {
    expectKinds(updateCopy, {
      upToDate: 'sentence',
      checkFailed: 'sentence',
      playManaged: 'sentence',
      playTitle: 'label',
      checkFailedTitle: 'label',
      updateInPlay: 'action',
    });
  });

  it('핵심 화면이 도메인 카탈로그를 직접 사용합니다', () => {
    expect(readSource('src/app/alarm-settings.tsx')).toContain(
      'alarmCopy.testAlarm.text',
    );
    expect(readSource('src/app/(tabs)/timer.tsx')).toContain(
      'alarmCopy.openSettings.text',
    );
    expect(readSource('src/components/settings-home.tsx')).toContain(
      'dataCopy.managementSummary.text',
    );
    expect(readSource('src/app/data-settings.tsx')).toContain(
      'dataCopy.restoreQuestion.text',
    );
    expect(readSource('src/features/update/play-app-update-screen.tsx')).toContain(
      'updateCopy.updateInPlay.text',
    );
    expect(readSource('src/features/update/direct-app-update-screen.tsx')).toContain(
      'updateCopy.checkFailedTitle.text',
    );
  });
});
