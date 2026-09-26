import React from 'react';
import { ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { TargetId } from '../../types/tutorial';

// Wraps content in a measurable View so it can be highlighted by a tour
// step. Only for plain column/row flow — inside a %-width grid the extra
// wrapper breaks the children's sizing; give the card itself a target
// instead (see useTutorialTarget).
export function TourTarget({
  id,
  scrollRef,
  style,
  children,
}: {
  id: TargetId;
  scrollRef?: React.RefObject<ScrollView | null>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { ref, onLayout } = useTutorialTarget(id, scrollRef);
  return (
    <View ref={ref} onLayout={onLayout} collapsable={false} style={style}>
      {children}
    </View>
  );
}
