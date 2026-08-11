import { describe, expect, it } from 'vitest';

import {
  resolveAppButtonIcon,
  resolveAppButtonLabel,
} from '../app-button-policy';

describe('공통 버튼 표시 규칙', () => {
  it('비어 있는 문구도 빈 버튼으로 표시하지 않아요', () => {
    expect(resolveAppButtonLabel('')).toBe('계속하기');
    expect(resolveAppButtonLabel('   ')).toBe('계속하기');
  });

  it('앞뒤 공백을 제거해 문구와 접근성 이름을 같게 유지해요', () => {
    expect(resolveAppButtonLabel('  저장하기  ')).toBe('저장하기');
  });

  it('저장, 시험 알람, 뒤로 가기 동작은 전 화면에서 같은 아이콘을 사용해요', () => {
    expect(resolveAppButtonIcon('저장하기')).toBe('checkmark');
    expect(resolveAppButtonIcon('변경 내용 저장하기')).toBe('checkmark');
    expect(resolveAppButtonIcon('5초 뒤 시험 알람 울리기')).toBe('alarm-outline');
    expect(resolveAppButtonIcon('뒤로 가기')).toBe('chevron-back');
    expect(resolveAppButtonIcon('근무표로 돌아가기')).toBe('chevron-back');
  });

  it('화면에서 지정한 아이콘을 자동 규칙보다 우선해요', () => {
    expect(resolveAppButtonIcon('저장하기', 'download-outline')).toBe('download-outline');
  });

  it('저장하지 않고 나가기는 저장 아이콘으로 오해하지 않게 해요', () => {
    expect(resolveAppButtonIcon('저장하지 않고 나가기')).toBeUndefined();
  });
});
