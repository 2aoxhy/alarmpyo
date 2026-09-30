// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('앱 관리 문구', () => {
  it('배포 방식과 업데이트 상태를 짧게 표시합니다', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/features/app-management/app-management-controller.ts',
      ),
      'utf8',
    );

    expect(source).toContain('Google Play에서 새 버전 확인');
    expect(source).toContain('설치 파일 확인 및 업데이트');
    expect(source).not.toContain('안전하게 설치합니다');
    expect(source).not.toContain('최신 버전을 확인합니다');
  });
});
