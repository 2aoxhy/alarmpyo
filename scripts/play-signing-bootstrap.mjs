import {
  PLAY_APP_SIGNING_BLOCKER,
  PLAY_APP_SIGNING_STRATEGY_SEPARATE,
} from './play-release-policy.mjs';

export const PLAY_SIGNING_BOOTSTRAP_OPT_IN =
  'ALARMPYO_ALLOW_PLAY_SIGNING_BOOTSTRAP';
export const PLAY_SIGNING_BOOTSTRAP_PROFILE = 'play-signing-bootstrap';
export const PLAY_SIGNING_BOOTSTRAP_PURPOSE = 'play-signing-bootstrap';

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Play Console에서 별도 앱 서명 인증서를 처음 발급받기 위한 draft AAB에만
 * blocked 정책을 제한적으로 허용해요. 이 함수는 제출이나 공개 승격을 허용하지 않아요.
 */
export function assertPlaySigningBootstrapAllowed({
  environment = process.env,
  directPolicy,
  playPolicy,
}) {
  ensure(
    environment[PLAY_SIGNING_BOOTSTRAP_OPT_IN] === '1',
    `${PLAY_SIGNING_BOOTSTRAP_OPT_IN}=1을 명시한 1회성 Play 서명 부트스트랩만 허용해요.`,
  );
  ensure(
    Array.isArray(directPolicy?.signingCertificateSha256) &&
      directPolicy.signingCertificateSha256.length > 0,
    '확정된 AlarmPyo direct 서명 인증서가 없어 Play 서명 계보를 분리할 수 없어요.',
  );
  ensure(
    playPolicy?.appSigningStrategy === PLAY_APP_SIGNING_STRATEGY_SEPARATE,
    '먼저 Play 정책에서 Google 관리 별도 signer를 명시적으로 선택해야 해요.',
  );
  ensure(
    playPolicy?.releaseState === 'blocked' &&
      playPolicy?.appSigningCertificateSha256 === null &&
      playPolicy?.releaseBlockers?.includes(PLAY_APP_SIGNING_BLOCKER),
    'Play 서명 부트스트랩은 앱 서명 인증서가 아직 확인되지 않은 blocked 정책에서만 실행할 수 있어요.',
  );
  ensure(
    playPolicy?.directUpgradeCompatible === null,
    'Play 서명 계보가 이미 결정되어 부트스트랩 AAB를 만들 수 없어요.',
  );
  return {
    purpose: PLAY_SIGNING_BOOTSTRAP_PURPOSE,
    buildProfile: PLAY_SIGNING_BOOTSTRAP_PROFILE,
    submissionEligible: false,
  };
}
