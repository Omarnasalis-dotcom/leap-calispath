import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/** Icons drawn from the handoff's own SVG paths (24×24 viewBox). */
export type KitIconName =
  | 'stopwatch' | 'bolt' | 'snowflake' | 'target' | 'podium' | 'crown'
  | 'close' | 'back' | 'play' | 'plus' | 'pencil';

interface Props {
  name: KitIconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

export function KitIcon({ name, size = 18, color, strokeWidth = 2.4 }: Props) {
  const stroke = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let body: React.ReactNode;
  switch (name) {
    case 'stopwatch':
      body = (<><Circle cx={12} cy={13} r={8} {...stroke} /><Path d="M12 9v4l2 2M10 2h4" {...stroke} /></>);
      break;
    case 'bolt':
      body = <Path d="M13 2L4 14h6l-1 8 9-12h-6z" fill={color} />;
      break;
    case 'snowflake':
      body = <Path d="M12 2v20M4 6.5l16 11M20 6.5l-16 11M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" {...stroke} />;
      break;
    case 'target':
      body = (<><Circle cx={12} cy={12} r={9} {...stroke} /><Circle cx={12} cy={12} r={5} {...stroke} /><Circle cx={12} cy={12} r={1.2} fill={color} /></>);
      break;
    case 'podium':
      body = <Path d="M3 20h18M9.5 20V9h5v11M3.5 20v-6h6M14.5 20v-8.5h6V20" {...stroke} strokeLinecap="butt" />;
      break;
    case 'crown':
      body = <Path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" fill={color} />;
      break;
    case 'close':
      body = <Path d="M6 6l12 12M18 6L6 18" {...stroke} />;
      break;
    case 'back':
      body = <Path d="M15 6l-6 6 6 6" {...stroke} />;
      break;
    case 'play':
      body = <Path d="M7 4l13 8-13 8z" fill={color} />;
      break;
    case 'plus':
      body = <Path d="M12 5v14M5 12h14" {...stroke} />;
      break;
    case 'pencil':
      body = <Path d="M4 20h4L19 9l-4-4L4 16z" {...stroke} />;
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
