import React from 'react';
import { View } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';

interface ProgressRingProps {
  progress: number; // 0 to 100
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees - 90) * (Math.PI / 180.0);
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  };
};

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  // SVG arcs don't draw correctly if start == end or difference is 360
  const adjustedEnd = endAngle === 360 ? 359.999 : endAngle;
  const start = polarToCartesian(x, y, radius, adjustedEnd);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = adjustedEnd - startAngle <= 180 ? '0' : '1';
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
};

export const ProgressRing: React.FC<ProgressRingProps> = ({ 
  progress, 
  size = 120, 
  color = '#FF5252',
  strokeWidth = 2
}) => {
  const cx = 50;
  const cy = 50;
  const r = 45;
  
  // Calculate progress arc
  const endAngle = (progress / 100) * 360;
  const progressPath = progress > 0 ? describeArc(cx, cy, r, 0, endAngle) : '';

  // Stealth styling
  const trackColor = '#111111';
  const shadowColor = 'rgba(0, 0, 0, 0.8)';
  const highlightColor = 'rgba(255, 255, 255, 0.08)';

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg viewBox="0 0 100 100" width="100%" height="100%">
        {/* Full Track - Embossed Shadow */}
        <G x="0.5" y="0.5">
          <Path d={describeArc(cx, cy, r, 0, 360)} fill="none" stroke={shadowColor} strokeWidth={strokeWidth} />
        </G>
        
        {/* Full Track - Embossed Highlight */}
        <G x="-0.5" y="-0.5">
          <Path d={describeArc(cx, cy, r, 0, 360)} fill="none" stroke={highlightColor} strokeWidth={strokeWidth} />
        </G>
        
        {/* Main Track */}
        <Path d={describeArc(cx, cy, r, 0, 360)} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />

        {/* Progress Arc */}
        {progress > 0 && (
          <Path 
            d={progressPath} 
            fill="none" 
            stroke={color} 
            strokeWidth={strokeWidth} 
            strokeLinecap="round" 
          />
        )}
      </Svg>
    </View>
  );
};
