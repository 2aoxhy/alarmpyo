import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import { Circle, G, Line, Path, Svg } from 'react-native-svg';

import type { AirQualityGrade } from '../../application/environment/environment-types';
import {
  resolveAirQualityVisual,
  type AirQualityIconVariant,
} from './air-quality-visual-model';

export {
  resolveAirQualityVisual,
  type AirQualityGrade,
  type AirQualityIconVariant,
  type AirQualityVisual,
  type AirQualityVisualTone,
} from './air-quality-visual-model';

export type AirQualityIconProps = Readonly<{
  grade: AirQualityGrade;
  color?: ColorValue;
  size?: number;
  strokeWidth?: number;
  testID?: string;
}>;

/**
 * 공기질을 색상 없이도 구분할 수 있는 코드 기반 SVG입니다.
 * 카드가 전체 상태를 한 번만 읽도록 아이콘 자체는 항상 장식으로 숨깁니다.
 */
export function AirQualityIcon({
  grade,
  color = '#C8CED6',
  size = 26,
  strokeWidth = 1.8,
  testID,
}: AirQualityIconProps) {
  const variant = resolveAirQualityVisual(grade).icon;
  return (
    <Svg
      accessible={false}
      aria-hidden
      fill="none"
      focusable={false}
      height={size}
      testID={testID}
      viewBox="0 0 24 24"
      width={size}>
      <G
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}>
        {renderAirQualityIcon(variant, color)}
      </G>
    </Svg>
  );
}

function renderAirQualityIcon(
  variant: AirQualityIconVariant,
  color: ColorValue,
): ReactNode {
  switch (variant) {
    case 'clear-face':
      return (
        <>
          <Circle cx="11" cy="12.5" r="7.5" />
          <Circle cx="8.4" cy="11" fill={color} r="0.75" stroke="none" />
          <Circle cx="13.6" cy="11" fill={color} r="0.75" stroke="none" />
          <Path d="M7.8 14.2c.9 1.5 2 2.2 3.2 2.2s2.3-.7 3.2-2.2" />
          <Path d="M18.5 3.2v3.4M16.8 4.9h3.4" />
          <Path d="m18.5 8.2.01.01" />
        </>
      );
    case 'particle-face':
      return (
        <>
          <Circle cx="10.5" cy="12.5" r="7.5" />
          <Circle cx="8" cy="11" fill={color} r="0.7" stroke="none" />
          <Circle cx="13" cy="11" fill={color} r="0.7" stroke="none" />
          <Line x1="8.2" x2="12.8" y1="15.3" y2="15.3" />
          <Circle cx="19" cy="6" fill={color} r="1" stroke="none" />
          <Circle cx="20.3" cy="10.5" fill={color} r="0.75" stroke="none" />
          <Circle cx="18.7" cy="15.1" fill={color} r="0.55" stroke="none" />
        </>
      );
    case 'kf-mask':
      return (
        <>
          <Path d="M5 11.7V9a7 7 0 0 1 14 0v2.7" />
          <Circle cx="9" cy="9.2" fill={color} r="0.7" stroke="none" />
          <Circle cx="15" cy="9.2" fill={color} r="0.7" stroke="none" />
          <Path d="m6.2 11 5.8 2.1 5.8-2.1v5.4L12 20l-5.8-3.6V11Z" fill={color} fillOpacity="0.12" />
          <Path d="M6.2 12.1 3.8 11v5.1l2.4-1M17.8 12.1l2.4-1.1v5.1l-2.4-1" />
          <Path d="M9.1 14.2h5.8M9.8 16.5h4.4" />
        </>
      );
    case 'respirator':
      return (
        <>
          <Path d="M5.3 11.4V9a6.7 6.7 0 0 1 13.4 0v2.4" />
          <Circle cx="9.1" cy="8.8" fill={color} r="0.7" stroke="none" />
          <Circle cx="14.9" cy="8.8" fill={color} r="0.7" stroke="none" />
          <Path d="m9.2 11.2 2.8-1.1 2.8 1.1v5.5L12 19l-2.8-2.3v-5.5Z" fill={color} fillOpacity="0.12" />
          <Circle cx="5.8" cy="15.1" fill={color} fillOpacity="0.12" r="2.8" />
          <Circle cx="18.2" cy="15.1" fill={color} fillOpacity="0.12" r="2.8" />
          <Path d="m4.6 13.9 2.4 2.4M7 13.9l-2.4 2.4M17 13.9l2.4 2.4M19.4 13.9 17 16.3" />
          <Path d="M9.2 13.2H8.4M15.6 13.2h-.8" />
        </>
      );
    case 'unknown':
      return (
        <>
          <Circle cx="12" cy="12" r="8.5" />
          <Path d="M9.7 9.1a2.5 2.5 0 0 1 4.8.9c0 2-2.5 2.2-2.5 4" />
          <Circle cx="12" cy="17.3" fill={color} r="0.8" stroke="none" />
        </>
      );
  }
}
