import { describe, expect, it } from 'vitest';

import {
  resolveAppButtonIcon,
  resolveAppButtonLabel,
} from '../app-button-policy';

describe('공통 버튼 표시 규칙', () => {
  it('비어 있는 문구도 빈 버튼으로 표시하지 않습니다', () => {
    expect(resolveAppButtonLabel('')).toBe('계속');
    expect(resolveAppButtonLabel('   ')).toBe('계속');
  });

  it('앞뒤 공백을 제거해 문구와 접근성 이름을 같게 유지합니다', () => {
    expect(resolveAppButtonLabel('  저장  ')).toBe('저장');
  });

  it('명시한 행동 식별자는 전 화면에서 같은 아이콘을 사용합니다', () => {
    expect(resolveAppButtonIcon('save')).toBe('checkmark');
    expect(resolveAppButtonIcon('test-alarm')).toBe('alarm-outline');
    expect(resolveAppButtonIcon('back')).toBe('chevron-back');
  });

  it('화면에서 지정한 아이콘을 행동 기본값보다 우선합니다', () => {
    expect(resolveAppButtonIcon('save', 'download-outline')).toBe('download-outline');
  });

  it('행동 식별자가 없으면 문구에서 아이콘을 추론하지 않습니다', () => {
    expect(resolveAppButtonIcon()).toBeUndefined();
  });
});
