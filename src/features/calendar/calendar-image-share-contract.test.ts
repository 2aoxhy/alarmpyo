// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readCalendarSource(fileName: string) {
  return readFileSync(
    resolve(process.cwd(), 'src/features/calendar', fileName),
    'utf8',
  );
}

const calendarScreenSource = readFileSync(
  resolve(process.cwd(), 'src/app/(tabs)/calendar.tsx'),
  'utf8',
);

describe('달력 이미지 공유 UI 계약', () => {
  it('고정 360×450 뷰를 1080×1350 PNG 임시 파일로 캡처합니다', () => {
    const modelSource = readCalendarSource('calendar-image-share-model.ts');
    const controllerSource = readCalendarSource('calendar-image-share-controller.ts');

    expect(modelSource).toContain('CALENDAR_IMAGE_LOGICAL_WIDTH = 360');
    expect(modelSource).toContain('CALENDAR_IMAGE_LOGICAL_HEIGHT = 450');
    expect(modelSource).toContain('CALENDAR_IMAGE_PIXEL_WIDTH = 1080');
    expect(modelSource).toContain('CALENDAR_IMAGE_PIXEL_HEIGHT = 1350');
    expect(controllerSource).toContain("result: 'tmpfile'");
    expect(controllerSource).not.toContain("result: 'base64'");
  });

  it('캡처 전용 뷰를 숨기고 실제 모달로 뒤 달력의 TalkBack 초점을 막습니다', () => {
    const source = readCalendarSource('calendar-image-capture-layer.tsx');

    expect(source).toContain('accessibilityElementsHidden');
    expect(source).toContain('importantForAccessibility="no-hide-descendants"');
    expect(source).toContain('pointerEvents="none"');
    expect(source).toContain('accessibilityViewIsModal');
    expect(source).toContain('<Modal');
    expect(source).toContain('statusBarTranslucent');
  });

  it('금지된 이전 일정 제목을 사용하지 않습니다', () => {
    const sources = [
      readCalendarSource('calendar-image-share-model.ts'),
      readCalendarSource('calendar-image-share-controller.ts'),
      readCalendarSource('calendar-image-capture-layer.tsx'),
    ].join('\n');

    expect(sources).not.toContain('알람표 근무 일정');
  });

  it('고정 6행과 글자 크기 독립형 타이포·하단 근무 띠를 사용합니다', () => {
    const modelSource = readCalendarSource('calendar-image-share-model.ts');
    const captureSource = readCalendarSource('calendar-image-capture-layer.tsx');

    expect(modelSource).toContain('CALENDAR_IMAGE_WEEK_COUNT = 6');
    expect(captureSource.match(/allowFontScaling=\{false\}/gu)?.length).toBe(5);
    expect(captureSource).toContain('numberOfLines={2}');
    expect(captureSource).toContain('styles.shiftStrip');
    expect(captureSource).not.toContain('styles.shiftBadge');
  });

  it('오류 팝업을 뒤로 닫아도 이미지 공유 버튼으로 초점을 복원합니다', () => {
    expect(calendarScreenSource).toContain(
      "{ tone: 'neutral', onDismiss: restoreImageShareFocus }",
    );
  });
});
