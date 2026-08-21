import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';

const POLICY_SECTIONS = [
  {
    title: '처리하는 정보',
    body: '알람표는 계정을 만들지 않으며 광고·분석 도구를 사용하지 않습니다. 근무표, 알람·타이머 설정, 메모와 화면 설정은 이 기기의 앱 저장 공간에 보관합니다. 환경 브리핑을 켜면 선택한 지역 격자와 마지막 날씨·공기질 결과도 기기에 보관합니다.',
  },
  {
    title: '외부 전송',
    body: '근무 데이터와 출퇴근 시각은 환경 브리핑 서버에 전송하지 않습니다. 백업이나 근무 설정 공유를 직접 선택한 경우에만 사용자가 고른 앱 또는 저장 위치로 파일을 전달합니다.',
  },
  {
    title: '업데이트 통신',
    body: '앱은 실행할 때 Expo의 EAS Update 서버에 HTTPS로 호환되는 업데이트가 있는지 확인할 수 있습니다. 이 과정에서 기기 운영체제, 앱·런타임 버전, 프로젝트 식별자, 무작위 설치 토큰, IP 주소와 네트워크 요청, 업데이트 오류·성능 진단 정보를 Expo가 업데이트 제공·보안·오류 확인과 서비스 운영을 위해 처리할 수 있습니다.',
  },
  {
    title: '공식 패턴과 공개 방침',
    body: '사용자가 근무 패턴 보관함을 열거나 새로고침하면 앱은 GitHub Pages에서 전자서명된 공식 근무 패턴 세 파일을 HTTPS로 조회합니다. 백그라운드에서 주기적으로 조회하지 않으며, 기기에 저장된 근무표·메모·알람·타이머 설정을 요청에 포함하지 않습니다. 공개 방침 페이지를 열거나 공식 패턴을 조회할 때 GitHub가 서비스의 보안과 무결성을 위해 방문자의 IP 주소를 기록·저장할 수 있습니다.',
  },
  {
    title: '날씨·공기질과 대략적 위치',
    body: '환경 브리핑은 사용자가 직접 켜고 앱을 보고 있을 때 초기 설정이나 새로고침에 필요한 경우에만 현재 위치의 대략적인 범위를 확인합니다. 원 좌표는 기기에서 기상청 5km 격자로 바꾼 뒤 폐기하고 저장하거나 서버로 보내지 않습니다. 격자와 네트워크 IP는 Cloudflare 기반 중계 서버가 기상청 예보와 한국환경공단 에어코리아 실측값을 조회·캐시하고 남용을 막는 동안 처리할 수 있습니다. 위치 권한을 거부해도 지역을 직접 선택할 수 있으며 기능을 끄거나 앱 데이터를 초기화하면 기기에 저장한 지역과 캐시를 삭제합니다.',
  },
  {
    title: '수면 안내와 건강 정보',
    body: '수면 준비 시점은 기기에 저장된 근무 일정으로만 계산합니다. 수면 패턴·수면 질·건강 상태나 신체 센서 정보를 입력받거나 측정·기록·전송하지 않습니다. 의료기기가 아니며 질환을 진단·치료·치유·예방하지 않습니다. 의료 조언이 필요한 경우 의료 전문가와 상담하는 것이 좋습니다.',
  },
  {
    title: '권한 사용',
    body: '알림, 정확한 알람, 전체 화면 알람, 진동, 부팅 후 알람 복구와 알람음 재생 권한은 근무·타이머 알람을 제시간에 전달하는 데 사용합니다. 대략적 위치 권한은 앱을 보고 있을 때 사용자가 요청한 지역 날씨와 공기질을 찾는 데만 사용하며 정밀·백그라운드 위치는 요청하지 않습니다. 파일은 Android 시스템 선택 화면에서 사용자가 직접 고른 항목만 읽거나 저장합니다.',
  },
  {
    title: '보관과 삭제',
    body: '설정에서 초기화하면 현재 근무표·메모·설정과 환경 브리핑 지역·캐시가 초기화되고 실행 중인 타이머가 취소되지만, 복구할 수 있도록 초기화 직전 근무 자료를 앱 내부 안전 백업으로 남깁니다. 환경 브리핑 정보는 근무 자료 백업에 포함하지 않습니다. 앱을 삭제하면 현재 자료와 내부 안전 백업이 함께 삭제됩니다. 외부로 내보낸 백업 파일은 저장한 위치에서 직접 삭제해야 합니다. 외부 서비스가 처리하는 기술 정보는 각 서비스의 보관·삭제 기준을 따릅니다.',
  },
  {
    title: '아동과 계정',
    body: '알람표는 계정 생성 기능이 없고 아동을 대상으로 개인정보를 수집하지 않습니다.',
  },
] as const;

export default function PrivacyScreen() {
  const styles = useThemedStyles(createStyles);

  return (
    <>
      <Stack.Screen options={{ title: '개인정보 처리방침' }} />
      <Screen contentStyle={styles.screen}>
        <AppText tone="secondary" style={styles.centerText}>
          알람표가 데이터를 저장하고 사용하는 기준을 안내합니다.
        </AppText>

        <Card style={styles.policyCard}>
          {POLICY_SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <AppText accessibilityRole="header" variant="heading">
                {section.title}
              </AppText>
              <AppText tone="secondary">{section.body}</AppText>
            </View>
          ))}
        </Card>

        <Card density="compact" style={styles.contactCard}>
          <AppText accessibilityRole="header" variant="label">
            문의와 시행일
          </AppText>
          <AppText tone="secondary">
            개인정보 관련 문의는 앱을 설치한 스토어의 개발자 연락처로 문의할 수
            있습니다. 보안 취약점은 공개 저장소의 비공개 보안 신고 기능으로 신고할
            수 있습니다.
          </AppText>
          <AppText tone="tertiary" variant="caption">
            시행일 2026년 8월 21일
          </AppText>
        </Card>
      </Screen>
    </>
  );
}

const createStyles = (_palette: AppPalette) =>
  StyleSheet.create({
    screen: { gap: spacing.large },
    centerText: { textAlign: 'center' },
    policyCard: { gap: spacing.large },
    section: { gap: spacing.small },
    contactCard: { gap: spacing.small },
  });
