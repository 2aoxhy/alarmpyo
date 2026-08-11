import { describe, expect, it } from 'vitest';

import {
  getAlarmSoundFallbackMessage,
  shouldStackAlarmSoundActions,
} from './alarm-sound-settings-model';

describe('알람음 설정 표시 정책', () => {
  it('선택한 음원이 없어지면 실제 대체 재생 순서를 안내해요', () => {
    expect(
      getAlarmSoundFallbackMessage({
        available: false,
        label: 'Morning',
        selected: true,
        supported: true,
      }),
    ).toContain('시스템 기본 알람음, 벨소리, 알림음 순서');
  });

  it('현재 음원이 사용 가능하면 불필요한 경고를 표시하지 않아요', () => {
    expect(
      getAlarmSoundFallbackMessage({
        available: true,
        label: '시스템 기본 알람음',
        selected: false,
        supported: true,
      }),
    ).toBeNull();
  });

  it('좁은 화면과 큰 글자에서는 버튼을 세로로 배치해요', () => {
    expect(shouldStackAlarmSoundActions(320, 1)).toBe(true);
    expect(shouldStackAlarmSoundActions(412, 1.4)).toBe(true);
    expect(shouldStackAlarmSoundActions(412, 1)).toBe(false);
  });
});
