import { describe, expect, it } from 'vitest';

import { isSuccessDialogTitle } from '../app-dialog-tone';

describe('앱 팝업 색상', () => {
  it('해요체 완료 문구를 성공 상태로 표시해요', () => {
    expect(isSuccessDialogTitle('전체 백업 파일을 준비했어요')).toBe(true);
    expect(isSuccessDialogTitle('업데이트를 적용했어요')).toBe(true);
    expect(isSuccessDialogTitle('최근 백업을 복구했어요')).toBe(true);
  });

  it('완료 단어가 있어도 실패 문구를 성공으로 표시하지 않아요', () => {
    expect(isSuccessDialogTitle('업데이트 완료에 실패했어요')).toBe(false);
    expect(isSuccessDialogTitle('복구하지 못했어요')).toBe(false);
  });
});
