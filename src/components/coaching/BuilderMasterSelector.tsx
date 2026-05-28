import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LeapLogo } from './../../components/LeapLogo';
import { styles } from '../../screens/coaching/ProgramBuilderScreen.styles';

export function BuilderMasterSelector({
  errorMsg,
  catalogLoading,
  masterTemplates,
  solidCardBg,
  bronzeGold,
  theme,
  setTemplateName,
  setTemplateDesc,
  setDays,
  setUseWeeklyStructure,
  setIsCreatingNew,
  setActiveTemplateId,
  loadExistingTemplate,
  handleDeleteTemplate
}: any) {
  return (
<View style={{ width: '100%', gap: 20 }}>
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* CREATE NEW TEMPLATE CARD */}
            <LinearGradient
              colors={['#7E57C2', '#FF5252', '#FF7043']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ padding: 1.2, borderRadius: 12 }}
            >
              <TouchableOpacity
                style={[styles.createNewCard, { backgroundColor: solidCardBg, borderWidth: 0, borderRadius: 11 }]}
                onPress={() => {
                  setTemplateName('');
                  setTemplateDesc('');
                  setDays([]);
                  setUseWeeklyStructure(false);
                  setIsCreatingNew(true);
                }}
              >
                <Text style={[styles.createNewCardText, { color: theme.text.primary }]}>+ CREATE NEW MASTER TEMPLATE</Text>
              </TouchableOpacity>
            </LinearGradient>

            <View style={{ gap: 12, marginTop: 10 }}>
              <Text style={[styles.sectionTitleStyle, { color: theme.text.primary }]}>
                SAVED MASTER TEMPLATES
              </Text>

              {catalogLoading ? (
                <LeapLogo size={40} animated />
              ) : masterTemplates.length === 0 ? (
                <View style={[styles.emptyBox, { borderColor: theme.card.border }]}>
                  <Text style={{ color: theme.text.secondary, fontSize: 13 }}>
                    NO MASTER TEMPLATES SAVED YET.
                  </Text>
                </View>
              ) : (
                masterTemplates.map((t: any) => (
                  <LinearGradient
                    key={t.id}
                    colors={['#7E57C2', '#FF5252', '#FF7043']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ padding: 1.2, borderRadius: 12, marginBottom: 12 }}
                  >
                    <View
                      style={[styles.catalogCardItem, { backgroundColor: solidCardBg, borderColor: 'transparent', borderRadius: 11, marginBottom: 0 }]}
                    >
                      <View style={{ flex: 1, marginRight: 16 }}>
                        <Text style={[styles.catalogCardName, { color: theme.text.primary }]}>
                          {t.name.toUpperCase()}
                        </Text>
                        <Text style={[styles.catalogCardCount, { color: bronzeGold }]}>
                          {t.block_count} WORKOUT BLOCKS / DAYS
                        </Text>
                        {t.description ? (
                          <Text style={{ color: theme.text.tertiary, fontSize: 12, marginTop: 6 }} numberOfLines={2}>
                            {t.description}
                          </Text>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.catalogCardEditBtn, { borderColor: bronzeGold }]}
                          onPress={() => {
                            setActiveTemplateId(t.id);
                            loadExistingTemplate(t.id);
                          }}
                        >
                          <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>EDIT</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.catalogCardDelBtn, { borderColor: 'rgba(255,107,107,0.2)' }]}
                          onPress={() => handleDeleteTemplate(t.id)}
                        >
                          <Text style={{ color: '#FF6B6B', fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>DELETE</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </LinearGradient>
                ))
              )}
            </View>
          </View>
  );
}
