import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Input } from '../../components/Input';
import { styles } from '../../screens/coaching/ProgramBuilderScreen.styles';

export function BuilderHeader({
  templateName,
  setTemplateName,
  templateDesc,
  setTemplateDesc,
  useWeeklyStructure,
  handleToggleWeeklyStructure,
  theme,
  inactiveBorder
}: any) {
  const [localTemplateName, setLocalTemplateName] = useState(templateName);
  const [localTemplateDesc, setLocalTemplateDesc] = useState(templateDesc);

  useEffect(() => {
    setLocalTemplateName(templateName);
  }, [templateName]);

  useEffect(() => {
    setLocalTemplateDesc(templateDesc);
  }, [templateDesc]);

  const handleNameBlur = () => {
    if (localTemplateName !== templateName) {
      setTemplateName(localTemplateName);
    }
  };

  const handleDescBlur = () => {
    if (localTemplateDesc !== templateDesc) {
      setTemplateDesc(localTemplateDesc);
    }
  };

  return (
<View style={[styles.sectionCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.sectionLabel, { color: theme.text.primary }]}>PROGRAM DETAILS</Text>
              <Input
                label="PROGRAM NAME"
                placeholder="E.G. 12-WEEK STRENGTH SYSTEM"
                value={localTemplateName}
                onChangeText={setLocalTemplateName}
                onBlur={handleNameBlur}
                onEndEditing={handleNameBlur}
              />
              <View style={styles.inputContainerStyle}>
                <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>PROGRAM DESCRIPTION</Text>
                <TextInput
                  style={[
                    styles.textareaStyle,
                    {
                      backgroundColor: theme.card.background,
                      borderColor: theme.card.border,
                      color: theme.text.primary,
                    }
                  ]}
                  value={localTemplateDesc}
                  onChangeText={setLocalTemplateDesc}
                  onBlur={handleDescBlur}
                  onEndEditing={handleDescBlur}
                  placeholder="Describe the target outcomes, focus areas, and instructions..."
                  placeholderTextColor={theme.text.tertiary}
                  multiline={true}
                  numberOfLines={3}
                />
              </View>

              {/* WEEKLY STRUCTURE TOGGLE */}
              <View style={[styles.toggleContainer, { borderTopColor: theme.card.border }]}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleTitle, { color: theme.text.primary }]}>USE WEEKLY STRUCTURE</Text>
                    <Text style={[styles.toggleDesc, { color: theme.text.secondary }]}>
                      Organize workout blocks by days of the week (Saturday - Friday).
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleToggleWeeklyStructure(!useWeeklyStructure)}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={useWeeklyStructure ? ['#7E57C2', '#FF5252', '#FF7043'] : [inactiveBorder, inactiveBorder]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        width: 46,
                        height: 26,
                        borderRadius: 13,
                        padding: 2,
                        justifyContent: 'center'
                      }}
                    >
                      <View style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: '#FFFFFF',
                        alignSelf: useWeeklyStructure ? 'flex-end' : 'flex-start',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2,
                        shadowRadius: 2,
                        elevation: 2
                      }} />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
  );
}
