import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { styles } from '../../screens/coaching/ProgramBuilderScreen.styles';

export function BuilderWeekNavigator({
  weeks,
  activeWeek,
  setActiveWeek,
  setWeeks,
  handleDeleteWeek,
  theme,
  bronzeGold
}: any) {
  return (
<View style={{ marginBottom: 24 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
                {Object.keys(weeks).map((weekStr) => {
                  const wNum = parseInt(weekStr, 10);
                  const isActive = wNum === activeWeek;
                  return (
                    <TouchableOpacity
                      key={wNum}
                      onPress={() => setActiveWeek(wNum)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        backgroundColor: isActive ? 'rgba(200,160,64,0.15)' : theme.card.background,
                        borderWidth: 1,
                        borderColor: isActive ? bronzeGold : theme.card.border,
                      }}
                    >
                      <Text style={{
                        fontFamily: 'BarlowCondensed-Bold',
                        fontSize: 14,
                        color: isActive ? bronzeGold : theme.text.secondary
                      }}>
                        WEEK {wNum}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => {
                    const maxW = Math.max(...Object.keys(weeks).map(k => parseInt(k, 10)));
                    const nextW = maxW + 1;

                    const prevDays = weeks[activeWeek] || [];
                    const clonedDays: any[] = prevDays.map((d: any) => ({
                      id: Math.random().toString(36).substr(2, 9),
                      name: d.name,
                      blocks: d.blocks.map((b: any) => ({
                        id: Math.random().toString(36).substr(2, 9),
                        name: b.name,
                        notes: b.notes,
                        exercises: b.exercises.map((ex: any) => ({
                          ...ex,
                          id: Math.random().toString(36).substr(2, 9)
                        })),
                        metadata: b.metadata
                      }))
                    }));

                    setWeeks((prev: any) => ({ ...prev, [nextW]: clonedDays }));
                    setActiveWeek(nextW);
                  }}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.1)',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <Text style={{
                    fontFamily: 'BarlowCondensed-Bold',
                    fontSize: 14,
                    color: theme.text.primary
                  }}>
                    + DUPLICATE LAST WEEK
                  </Text>
                </TouchableOpacity>
              </ScrollView>
              </View>
  );
}
