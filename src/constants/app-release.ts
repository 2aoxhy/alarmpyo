import * as Updates from 'expo-updates';

import { formatAppUpdateDate } from '@/utils/app-release-date';

/**
 * 현재 실제로 실행 중인 내장 번들 또는 무선 업데이트의 생성일을 표시해요.
 * 개발 환경처럼 생성일을 제공하지 않는 경우에는 최신이라고 단정하지 않아요.
 */
export function getCurrentAppUpdateLabel(): string {
  const date = formatAppUpdateDate(Updates.createdAt);
  return date ? `최근 업데이트 : ${date}` : '현재 설치본을 사용하고 있어요';
}
