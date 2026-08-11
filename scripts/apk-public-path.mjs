const PUBLIC_DOWNLOAD_PREFIX = '/downloads/';
const VERSION_DIRECTORY_PATTERN = /^v[1-9]\d*$/u;
const APK_FILE_PATTERN = /^AlarmPyo_[0-9]{8}\.apk$/iu;

function productionOrigin(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error(
      'AlarmPyo production Hosting URL이 아직 설정되지 않았거나 올바르지 않아요.',
    );
  }
}

/**
 * 설정된 production Hosting의 `/downloads/` 아래 경로만 그대로 보존해요.
 * 허용된 형태 외에는 복사하지 않아 경로 탈출과 배포 주소 불일치를 막아요.
 */
export function getPublicApkPathSegments(value, productionHostingUrl) {
  const expectedOrigin = productionOrigin(productionHostingUrl);
  const url = value instanceof URL ? value : new URL(value);
  if (
    url.origin !== expectedOrigin ||
    !url.pathname.startsWith(PUBLIC_DOWNLOAD_PREFIX)
  ) {
    return null;
  }

  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(url.pathname);
  } catch {
    throw new Error('공개 APK 주소의 경로 인코딩이 올바르지 않아요.');
  }

  const relativePath = decodedPathname.slice(PUBLIC_DOWNLOAD_PREFIX.length);
  const segments = relativePath.split('/');
  const valid =
    (segments.length === 1 && APK_FILE_PATTERN.test(segments[0])) ||
    (segments.length === 2 &&
      VERSION_DIRECTORY_PATTERN.test(segments[0]) &&
      APK_FILE_PATTERN.test(segments[1]));

  if (!valid) {
    throw new Error(
      '공개 APK 주소는 /downloads/AlarmPyo_오늘날짜.apk 또는 /downloads/v버전코드/AlarmPyo_오늘날짜.apk 형식이어야 해요.',
    );
  }
  return segments;
}
