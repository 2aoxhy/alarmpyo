import { describe, expect, it } from 'vitest';
import {
  hasExpoIgnoreRule,
  shouldAcceptMissingGitWarning,
} from '../run-expo-doctor.mjs';

const warning = `
✖ Check for common project setup issues
The .expo directory is not ignored by Git.
1 check failed, indicating possible issues with the project.
`;

describe('Expo 진단 환경 보정', () => {
  it('루트와 일반 Expo 제외 규칙을 인식해요', () => {
    expect(hasExpoIgnoreRule('.expo/\n')).toBe(true);
    expect(hasExpoIgnoreRule('/.expo\n')).toBe(true);
    expect(hasExpoIgnoreRule('# .expo/\ndist/\n')).toBe(false);
  });

  it('Git만 없고 Expo 제외 규칙이 있으면 알려진 경고만 허용해요', () => {
    expect(
      shouldAcceptMissingGitWarning({
        doctorOutput: warning,
        gitAvailable: false,
        gitIgnore: '.expo/\n',
      }),
    ).toBe(true);
  });

  it('Git이 있거나 다른 검사도 실패하면 허용하지 않아요', () => {
    expect(
      shouldAcceptMissingGitWarning({
        doctorOutput: warning,
        gitAvailable: true,
        gitIgnore: '.expo/\n',
      }),
    ).toBe(false);
    expect(
      shouldAcceptMissingGitWarning({
        doctorOutput: `${warning}\n✖ Check package versions`,
        gitAvailable: false,
        gitIgnore: '.expo/\n',
      }),
    ).toBe(false);
  });
});
