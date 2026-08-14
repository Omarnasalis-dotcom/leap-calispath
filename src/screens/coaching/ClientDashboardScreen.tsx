import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { LeapLogo } from '../../components/LeapLogo';

interface ClientDashboardScreenProps {
  warriorId: string;
  templateId: string;
  coachId?: string;
}

export function ClientDashboardScreen({ warriorId, templateId, coachId }: ClientDashboardScreenProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const bronzeGold = '#C8A040';
  const solidCardBg = theme.card.background === '#151515' || theme.card.background === '#1C1C1E' || theme.card.background === '#121212' || theme.card.background === '#000000' ? '#151515' : '#FFFFFF';

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [warriorName, setWarriorName] = useState('WARRIOR');
  const [warriorTier, setWarriorTier] = useState(1);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [archivedWeeks, setArchivedWeeks] = useState<Set<number>>(new Set());
  const [assignmentId, setAssignmentId] = useState<string | null>(null);

  useEffect(() => {
    loadClientData();
  }, [warriorId, templateId]);

  async function loadClientData() {
    setLoading(true);
    try {
      // 1. Fetch Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, strength_tier')
        .eq('id', warriorId)
        .single();
      if (profileError) throw profileError;
      setWarriorName(profile.display_name || 'WARRIOR');
      setWarriorTier(profile.strength_tier || 1);

      // 2. Fetch Assignment ID
      const { data: assign, error: assignError } = await supabase
        .from('warrior_programs')
        .select('id, status')
        .eq('template_id', templateId)
        .eq('warrior_id', warriorId)
        .single();
      
      if (!assignError && assign) {
        setAssignmentId(assign.id);
      }

      // 3. Fetch Blocks to determine weeks
      const { data: blocks, error: blocksError } = await supabase
        .from('program_blocks')
        .select('week_number')
        .eq('template_id', templateId);

      if (blocksError) throw blocksError;

      const uniqueWeeks = new Set<number>();
      (blocks || []).forEach(b => {
        if (b.week_number) uniqueWeeks.add(b.week_number);
        else uniqueWeeks.add(1); // fallback
      });

      setWeeks(Array.from(uniqueWeeks).sort((a, b) => a - b));

      // 4. Fetch archived weeks — hidden from the warrior's own program view,
      // but the coach should still see these clearly marked, not indistinguishable
      // from currently-active weeks.
      const { data: archived, error: archivedError } = await supabase
        .from('program_week_archive')
        .select('week_number')
        .eq('template_id', templateId);

      if (archivedError) throw archivedError;
      setArchivedWeeks(new Set((archived || []).map(a => a.week_number)));

    } catch (err: any) {
      const fullErr = `Error: ${err.message || 'Unknown'}\nCode: ${err.code || 'N/A'}\nDetails: ${err.details || 'N/A'}`;
      setErrorMsg(fullErr.toUpperCase());
    } finally {
      setLoading(false);
    }
  }

  const handleEditWeek = (weekNum: number) => {
    router.push(`/program-builder?templateId=${templateId}&weekNum=${weekNum}&coachId=${coachId}`);
  };

  const handleDeleteWeek = async (weekNum: number) => {
    const performDelete = async () => {
      setLoading(true);
      try {
        const { error: rpcErr } = await supabase.rpc('delete_coach_week_data', {
          p_template_id: templateId,
          p_week_number: weekNum
        });

        if (rpcErr) throw rpcErr;
        
        await loadClientData();
      } catch (err: any) {
        const fullErr = `Error: ${err.message || 'Unknown'}\nCode: ${err.code || 'N/A'}\nDetails: ${err.details || 'N/A'}`;
        console.error('Delete Week Error:', err);
        setErrorMsg(fullErr.toUpperCase());
        setLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`ARE YOU SURE YOU WANT TO DELETE WEEK ${weekNum}? ALL BLOCKS AND EXERCISES WILL BE REMOVED, INCLUDING THE CLIENT'S LOGGED WORKOUT HISTORY FOR THIS WEEK.`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        'DELETE WEEK',
        `ARE YOU SURE YOU WANT TO DELETE WEEK ${weekNum}? ALL BLOCKS AND EXERCISES WILL BE REMOVED, INCLUDING THE CLIENT'S LOGGED WORKOUT HISTORY FOR THIS WEEK.`,
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'DELETE', style: 'destructive', onPress: performDelete }
        ]
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* HEADER BAR */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: theme.text.secondary }]}>◀ BACK TO ROSTER</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <LeapLogo size={40} animated />
          </View>
        ) : (
          <View style={{ gap: 24 }}>
            {/* CLIENT INFO CARD */}
            <View style={[styles.card, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
              <View style={{ alignItems: 'center' }}>
                <View style={[styles.avatarCircle, { backgroundColor: 'rgba(200, 160, 64, 0.15)' }]}>
                  <Text style={[styles.avatarText, { color: bronzeGold }]}>
                    {warriorName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.warriorName, { color: theme.text.primary }]}>
                  {warriorName.toUpperCase()}
                </Text>
                <Text style={[styles.warriorSub, { color: bronzeGold }]}>
                  STRENGTH TIER {warriorTier}
                </Text>
              </View>
            </View>

            {/* WEEKS LIST */}
            <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>PROGRAM TIMELINE</Text>
            
            {weeks.length === 0 ? (
              <View style={[styles.emptyStateCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.emptyStateText, { color: theme.text.secondary }]}>
                  THIS PROGRAM IS EMPTY.
                </Text>
                <TouchableOpacity
                  style={[styles.editBtn, { backgroundColor: 'rgba(200,160,64,0.1)', borderColor: bronzeGold, marginTop: 16 }]}
                  onPress={() => handleEditWeek(1)}
                >
                  <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 13 }}>START WEEK 1</Text>
                </TouchableOpacity>
              </View>
            ) : (
              weeks.map(wNum => {
                const isArchived = archivedWeeks.has(wNum);
                return (
                <View key={wNum} style={[styles.weekCard, { backgroundColor: theme.card.background, borderColor: isArchived ? 'rgba(255,255,255,0.15)' : theme.card.border, opacity: isArchived ? 0.6 : 1 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.weekTitle, { color: theme.text.primary }]}>WEEK {wNum}</Text>
                    <Text style={{ color: isArchived ? '#C8A040' : theme.text.secondary, fontSize: 11, fontFamily: 'BarlowCondensed-Bold' }}>
                      {isArchived ? 'ARCHIVED — HIDDEN FROM WARRIOR' : 'ACTIVE PROGRAMMING'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={[styles.editBtnInner, { backgroundColor: 'rgba(255,107,107,0.05)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)' }]}
                      onPress={() => handleDeleteWeek(wNum)}
                    >
                      <Text style={{ color: '#FF6B6B', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>DELETE</Text>
                    </TouchableOpacity>

                    <LinearGradient
                      colors={['#7E57C2', '#FF5252', '#FF7043']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ padding: 1.5, borderRadius: 8 }}
                    >
                      <TouchableOpacity
                        style={[styles.editBtnInner, { backgroundColor: theme.card.background }]}
                        onPress={() => handleEditWeek(wNum)}
                      >
                        <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>EDIT</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  </View>
                </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { padding: 20, paddingBottom: 60 },
  header: { marginBottom: 20 },
  backButton: { paddingVertical: 8 },
  backButtonText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1 },
  centerContainer: { paddingVertical: 100, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 12, padding: 24, alignItems: 'center' },
  avatarCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 28 },
  warriorName: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 24, letterSpacing: 1.5 },
  warriorSub: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, marginTop: 4 },
  sectionTitle: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 20, letterSpacing: 1.5, marginTop: 12 },
  emptyStateCard: { borderWidth: 1, borderRadius: 8, padding: 32, alignItems: 'center' },
  emptyStateText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.5 },
  weekCard: { borderWidth: 1, borderRadius: 8, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  weekTitle: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18, letterSpacing: 1 },
  editBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  editBtnInner: { borderRadius: 7, paddingVertical: 8, paddingHorizontal: 16 }
});
