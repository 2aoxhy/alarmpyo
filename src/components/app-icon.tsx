import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import { Circle, G, Line, Path, Polyline, Rect, Svg } from 'react-native-svg';

export type AppIconName =
  | 'add'
  | 'alarm-outline'
  | 'alert-circle-outline'
  | 'arrow-forward'
  | 'arrow-undo-outline'
  | 'book-outline'
  | 'calendar'
  | 'calendar-outline'
  | 'checkmark'
  | 'checkmark-circle'
  | 'chevron-back'
  | 'chevron-down'
  | 'chevron-forward'
  | 'chevron-up'
  | 'close'
  | 'download-outline'
  | 'ellipse-outline'
  | 'notifications'
  | 'notifications-off-outline'
  | 'notifications-outline'
  | 'options-outline'
  | 'pause-circle-outline'
  | 'pause'
  | 'play'
  | 'refresh-outline'
  | 'remove'
  | 'repeat'
  | 'repeat-outline'
  | 'settings'
  | 'settings-outline'
  | 'share-outline'
  | 'shield-outline'
  | 'star'
  | 'star-outline'
  | 'shift-day'
  | 'shift-night'
  | 'shift-off'
  | 'shift-substitute'
  | 'sync'
  | 'swap-horizontal'
  | 'timer'
  | 'timer-outline'
  | 'time-outline'
  | 'today'
  | 'today-outline'
  | 'trash-outline'
  | 'volume-mute-outline';

export type AppIconProps = {
  name: AppIconName;
  color?: ColorValue;
  size?: number;
  strokeWidth?: number;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * 앱에서 사용하는 아이콘을 한곳에 모은 코드 기반 SVG 컴포넌트입니다.
 * 모든 도형은 24 × 24 뷰박스를 사용하므로 크기가 달라도 선 굵기와 정렬이 일정합니다.
 */
export function AppIcon({
  name,
  color = '#171A2B',
  size = 24,
  strokeWidth = 1.9,
  accessible,
  accessibilityLabel,
  testID,
}: AppIconProps) {
  const decorative = accessible === false || !accessibilityLabel;
  return (
    <Svg
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityRole={decorative ? undefined : 'image'}
      aria-hidden={decorative ? true : undefined}
      fill="none"
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
        {renderIcon(name, color)}
      </G>
    </Svg>
  );
}

function renderIcon(name: AppIconName, color: ColorValue): ReactNode {
  switch (name) {
    case 'add':
      return (
        <>
          <Line x1="12" x2="12" y1="5" y2="19" />
          <Line x1="5" x2="19" y1="12" y2="12" />
        </>
      );
    case 'alarm-outline':
      return (
        <>
          <Circle cx="12" cy="13" r="7" />
          <Path d="M12 9v4.3l2.8 1.7M7 3.6 3.7 6.4M17 3.6l3.3 2.8M6.5 20.2l-1.3 1.3M17.5 20.2l1.3 1.3" />
        </>
      );
    case 'alert-circle-outline':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 7.4v5.2" />
          <Circle cx="12" cy="16.6" fill={color} r="0.8" stroke="none" />
        </>
      );
    case 'arrow-forward':
      return (
        <>
          <Line x1="4" x2="20" y1="12" y2="12" />
          <Polyline points="14,6 20,12 14,18" />
        </>
      );
    case 'arrow-undo-outline':
      return <Path d="M9.2 7.2 4 12l5.2 4.8M4.5 12H14a6 6 0 0 1 6 6v1" />;
    case 'book-outline':
      return (
        <>
          <Path d="M4 5.2c3.1-.5 5.8.3 8 2.2v11.4c-2.2-1.9-4.9-2.7-8-2.2V5.2Z" />
          <Path d="M20 5.2c-3.1-.5-5.8.3-8 2.2v11.4c2.2-1.9 4.9-2.7 8-2.2V5.2Z" />
          <Path d="M12 7.4v11.4" />
        </>
      );
    case 'calendar':
    case 'calendar-outline':
      return (
        <>
          <Rect fill={name === 'calendar' ? color : 'none'} fillOpacity="0.12" height="16" rx="2.5" width="18" x="3" y="5" />
          <Path d="M3 9.5h18M7.5 3v4M16.5 3v4" />
          <Path d="M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2M15 17h2" />
        </>
      );
    case 'checkmark':
      return <Polyline points="4.5,12.5 9.5,17.3 19.5,6.8" />;
    case 'checkmark-circle':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Polyline points="7.8,12.3 10.7,15.2 16.6,9" />
        </>
      );
    case 'chevron-back':
      return <Polyline points="14.8,5 7.8,12 14.8,19" />;
    case 'chevron-down':
      return <Polyline points="5,9.2 12,16.2 19,9.2" />;
    case 'chevron-forward':
      return <Polyline points="9.2,5 16.2,12 9.2,19" />;
    case 'chevron-up':
      return <Polyline points="5,14.8 12,7.8 19,14.8" />;
    case 'close':
      return (
        <>
          <Line x1="6" x2="18" y1="6" y2="18" />
          <Line x1="18" x2="6" y1="6" y2="18" />
        </>
      );
    case 'download-outline':
      return (
        <>
          <Path d="M12 3v11M7.5 10.5 12 15l4.5-4.5" />
          <Path d="M5 16.5V20h14v-3.5" />
        </>
      );
    case 'ellipse-outline':
      return <Circle cx="12" cy="12" r="8.5" />;
    case 'notifications':
    case 'notifications-outline':
      return (
        <>
          <Path
            d="M6.7 10.2a5.3 5.3 0 0 1 10.6 0c0 5 2.1 5.7 2.1 7.1H4.6c0-1.4 2.1-2.1 2.1-7.1Z"
            fill={name === 'notifications' ? color : 'none'}
            fillOpacity={name === 'notifications' ? 0.13 : 1}
          />
          <Path d="M9.7 20a2.7 2.7 0 0 0 4.6 0" />
        </>
      );
    case 'notifications-off-outline':
      return (
        <>
          <Path d="M8.2 6.1A5.3 5.3 0 0 1 17.3 10c0 2.2.4 3.6.9 4.6M6.7 10c0 5-2.1 5.7-2.1 7.1h10.2M9.7 20a2.7 2.7 0 0 0 4.6 0" />
          <Line x1="4" x2="20" y1="4" y2="20" />
        </>
      );
    case 'options-outline':
      return (
        <>
          <Path d="M4 6h5M15 6h5M4 12h9M19 12h1M4 18h2M12 18h8" />
          <Circle cx="12" cy="6" r="2" />
          <Circle cx="16" cy="12" r="2" />
          <Circle cx="9" cy="18" r="2" />
        </>
      );
    case 'pause-circle-outline':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Line x1="9.3" x2="9.3" y1="8" y2="16" />
          <Line x1="14.7" x2="14.7" y1="8" y2="16" />
        </>
      );
    case 'pause':
      return (
        <>
          <Line x1="9" x2="9" y1="6" y2="18" />
          <Line x1="15" x2="15" y1="6" y2="18" />
        </>
      );
    case 'play':
      return <Path d="M8 5.8 18 12 8 18.2Z" fill={color} stroke="none" />;
    case 'refresh-outline':
      return (
        <>
          <Path d="M20 7v5h-5M4 17v-5h5" />
          <Path d="M18.2 9A7.5 7.5 0 0 0 5.6 6.4L4 8M5.8 15A7.5 7.5 0 0 0 18.4 17.6L20 16" />
        </>
      );
    case 'remove':
      return <Line x1="5" x2="19" y1="12" y2="12" />;
    case 'repeat':
    case 'repeat-outline':
      return (
        <>
          <Path d="M17.5 7H7.8A3.8 3.8 0 0 0 4 10.8V12" />
          <Polyline points="14.5,4 17.5,7 14.5,10" />
          <Path d="M6.5 17h9.7a3.8 3.8 0 0 0 3.8-3.8V12" />
          <Polyline points="9.5,20 6.5,17 9.5,14" />
        </>
      );
    case 'settings':
    case 'settings-outline':
      return (
        <>
          <Path
            d="m9.8 3-.5 2a7.6 7.6 0 0 0-1.6.9l-2-.6-1.9 3.3 1.5 1.4a7.7 7.7 0 0 0 0 1.9l-1.5 1.4 1.9 3.3 2-.6a7.6 7.6 0 0 0 1.6.9l.5 2h4.4l.5-2a7.6 7.6 0 0 0 1.6-.9l2 .6 1.9-3.3-1.5-1.4a7.7 7.7 0 0 0 0-1.9l1.5-1.4-1.9-3.3-2 .6a7.6 7.6 0 0 0-1.6-.9l-.5-2H9.8Z"
            fill={name === 'settings' ? color : 'none'}
            fillOpacity={name === 'settings' ? 0.1 : 1}
          />
          <Circle cx="12" cy="11" r="3" />
        </>
      );
    case 'share-outline':
      return (
        <>
          <Circle cx="18" cy="5" r="2.5" />
          <Circle cx="6" cy="12" r="2.5" />
          <Circle cx="18" cy="19" r="2.5" />
          <Path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
        </>
      );
    case 'shield-outline':
      return (
        <>
          <Path d="M12 3 19 5.8v5.4c0 4.4-2.8 7.7-7 9.8-4.2-2.1-7-5.4-7-9.8V5.8L12 3Z" />
          <Polyline points="8.6,12 10.8,14.2 15.5,9.5" />
        </>
      );
    case 'star':
    case 'star-outline':
      return (
        <Path
          d="m12 3.4 2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 16.92l-5.3 2.79 1.01-5.9-4.29-4.18 5.93-.86L12 3.4Z"
          fill={name === 'star' ? color : 'none'}
        />
      );
    case 'shift-day':
      return (
        <>
          <Circle cx="12" cy="12" r="3.8" />
          <Path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" />
        </>
      );
    case 'shift-night':
      return <Path d="M20.3 15.1A8.4 8.4 0 0 1 9 3.7 8.6 8.6 0 1 0 20.3 15.1Z" />;
    case 'shift-off':
      return (
        <>
          <Path d="M3.5 13.5h17v5.7M3.5 19.2v-8.7M20.5 19.2v-3.5" />
          <Path d="M4 13.5h6.2v-2.1a2.2 2.2 0 0 0-2.2-2.2H4M10.2 13.5h10.3v-1.3a3 3 0 0 0-3-3h-7.3" />
          <Path d="M16.3 3.2h3.2l-3.2 3.2h3.2" />
        </>
      );
    case 'shift-substitute':
      return (
        <>
          <Circle cx="8" cy="7" r="2.6" />
          <Circle cx="16.2" cy="8.2" r="2.2" />
          <Path d="M3.8 15.5a4.2 4.2 0 0 1 8.4 0M13.2 13.3a3.4 3.4 0 0 1 6.6 1" />
          <Path d="M6 19h10.5M14.2 16.8l2.3 2.2-2.3 2.2M18 12H7.5M9.8 9.8 7.5 12l2.3 2.2" />
        </>
      );
    case 'sync':
      return (
        <>
          <Path d="M19 8.5A7.5 7.5 0 0 0 6.2 6L4.5 8M5 15.5A7.5 7.5 0 0 0 17.8 18l1.7-2" />
          <Polyline points="19,4.5 19,8.5 15,8.5" />
          <Polyline points="5,19.5 5,15.5 9,15.5" />
        </>
      );
    case 'swap-horizontal':
      return (
        <>
          <Path d="M4 8h14M14.5 4.5 18 8l-3.5 3.5" />
          <Path d="M20 16H6M9.5 12.5 6 16l3.5 3.5" />
        </>
      );
    case 'timer':
    case 'timer-outline':
      return (
        <>
          <Circle
            cx="12"
            cy="13"
            fill={name === 'timer' ? color : 'none'}
            fillOpacity={name === 'timer' ? 0.12 : 1}
            r="8"
          />
          <Path d="M9 3h6M12 3v2M18.2 6.8l1.5-1.5M12 9v4l3 2" />
        </>
      );
    case 'time-outline':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 7v5l3.5 2" />
        </>
      );
    case 'today':
    case 'today-outline':
      return (
        <>
          <Rect fill={name === 'today' ? color : 'none'} fillOpacity="0.12" height="17" rx="2.5" width="18" x="3" y="4" />
          <Path d="M3 9h18M7 2.8v3M17 2.8v3" />
          <Circle cx="12" cy="14.5" fill={color} r="2.2" stroke="none" />
        </>
      );
    case 'trash-outline':
      return (
        <>
          <Path d="M4.5 7h15M9 4h6l1 3H8l1-3Z" />
          <Path d="m6.5 7 .7 13h9.6l.7-13M10 10.5v6M14 10.5v6" />
        </>
      );
    case 'volume-mute-outline':
      return (
        <>
          <Path d="M4 9.5h4L13 5v14l-5-4.5H4v-5Z" />
          <Path d="m17 9 4 4M21 9l-4 4" />
        </>
      );
  }
}
