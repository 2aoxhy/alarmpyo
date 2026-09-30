// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const heroSource = readFileSync(
  resolve(process.cwd(), 'src/features/today/today-hero.tsx'),
  'utf8',
);
const screenSource = readFileSync(
  resolve(process.cwd(), 'src/app/(tabs)/index.tsx'),
  'utf8',
);

describe('오늘 텍스트 전용 히어로 계약', () => {
  it('일반 상태와 휴무·완료·빈 상태에 압축 높이를 적용합니다', () => {
    expect(screenSource).toContain('homeState={viewModel.homeState}');
    expect(heroSource).toContain("homeState === 'off'");
    expect(heroSource).toContain("homeState === 'finished'");
    expect(heroSource).toContain("homeState === 'empty'");
    expect(heroSource).toContain('minHeight: 188');
    expect(heroSource).toContain('minHeight: 172');
    expect(heroSource).toContain('styles.heroFooterPanel');
    expect(heroSource).toContain('styles.heroFooter');
  });

  it('좁은 화면과 큰 글자에서는 기존처럼 다음 근무와 수정 버튼을 세로로 쌓습니다', () => {
    expect(heroSource).toContain('shouldStackHeroFooter(width, fontScale)');
    expect(heroSource).toContain('styles.heroFooterStacked');
    expect(heroSource).toContain('stackFooter && styles.heroEditStacked');
  });

  it('장식 그림과 전용 슬롯 없이 제목·설명에 전체 폭을 사용합니다', () => {
    expect(heroSource).not.toContain('ROLE_ARTWORK_SOURCES');
    expect(heroSource).not.toContain('resolveTodayHeroArtworkKind');
    expect(heroSource).not.toContain('<Image');
    expect(heroSource).not.toContain('heroArtwork');
    expect(heroSource).not.toContain('LinearGradient');
    expect(heroSource).not.toContain('transform: [{ scale:');
    expect(heroSource).toContain('borderRadius: shape.panel');
    expect(heroSource).toContain("width: '100%'");

    const copyStart = heroSource.indexOf('styles.heroCopy');
    const footerStart = heroSource.indexOf('styles.heroFooterPanel');
    expect(copyStart).toBeGreaterThan(-1);
    expect(footerStart).toBeGreaterThan(copyStart);
  });

  it('다가오는 근무도 장식 그림 대신 의미선과 텍스트를 사용합니다', () => {
    const upcomingSource = readFileSync(
      resolve(process.cwd(), 'src/features/today/upcoming-work-section.tsx'),
      'utf8',
    );

    expect(upcomingSource).not.toContain('AnimatedShiftIcon');
    expect(upcomingSource).not.toContain('shiftIcon');
    expect(upcomingSource).toContain('styles.semanticRail');
    expect(upcomingSource).not.toContain('transform: [{ scale:');
  });

  it('제목·설명은 줄 수를 제한하지 않고 기능 아이콘은 유지합니다', () => {
    const copyMarkup = heroSource.slice(
      heroSource.indexOf('<View style={[styles.heroCopy'),
      heroSource.indexOf('<View style={styles.heroFooterPanel}'),
    );
    expect(copyMarkup).not.toContain('numberOfLines');
    expect(heroSource).toContain('name="options-outline"');
    expect(heroSource).toContain('일정 수정하기');
  });

  it('상태 문자는 역할 의미색을 쓰고 사용자 근무는 흰색 대비를 유지합니다', () => {
    expect(heroSource).toContain("visualRole === 'custom'");
    expect(heroSource).toContain('color={statusTextColor}');
    expect(heroSource).toContain('heroTheme.accent');
  });
});
