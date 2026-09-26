import React from 'react';
import { TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Header "?" that replays the current screen's tour.
export function TourHelpButton({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Show me how this screen works"
    >
      <MaterialCommunityIcons name="help-circle-outline" size={22} color={color} />
    </TouchableOpacity>
  );
}
