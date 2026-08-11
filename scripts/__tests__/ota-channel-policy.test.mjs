import { describe, expect, it } from 'vitest';

import {
  extractChannelArgument,
  readChannelBranch,
} from '../ota-channel-policy.mjs';

describe('OTA 채널 후보 정책', () => {
  it('운영 채널 인자를 제거하고 나머지 게시 옵션만 후보 브랜치로 넘겨요', () => {
    expect(
      extractChannelArgument([
        '--channel',
        'stable',
        '--platform',
        'android',
        '--message',
        '검증 후보',
      ]),
    ).toEqual({
      channel: 'stable',
      publishArgs: ['--platform', 'android', '--message', '검증 후보'],
    });
  });

  it('호출자가 후보 브랜치를 우회 지정하거나 알 수 없는 채널을 쓰지 못하게 해요', () => {
    expect(() =>
      extractChannelArgument(['--channel', 'stable', '--branch', 'stable']),
    ).toThrow('자동');
    expect(() => extractChannelArgument(['--channel', 'preview'])).toThrow(
      'stable 또는 canary',
    );
  });

  it('EAS branchMapping이 실제로 가리키는 단일 브랜치를 읽어요', () => {
    expect(
      readChannelBranch({
        currentPage: {
          branchMapping: JSON.stringify({
            version: 0,
            data: [{ branchId: 'branch-2', branchMappingLogic: 'true' }],
          }),
          updateBranches: [
            { id: 'branch-1', name: 'old-stable' },
            { id: 'branch-2', name: 'release-candidate-stable-abc' },
          ],
        },
      }),
    ).toBe('release-candidate-stable-abc');
  });
});
