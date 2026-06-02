import React from 'react';
import { Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { getCountryFlag } from '../../constants/countries';
import { LeapLogo } from '../LeapLogo';


interface LeaderboardModalsProps {
  showWRALeaderboard: boolean;
  setShowWRALeaderboard: (val: boolean) => void;
  showGloryLeaderboard: boolean;
  setShowGloryLeaderboard: (val: boolean) => void;
  loadingLB: boolean;
  genderFilter: string;
  setGenderFilter: (val: any) => void;
  filteredWraLeaderboard: any[];
  filteredGloryLeaderboard: any[];
}

export function LeaderboardModals({
  showWRALeaderboard,
  setShowWRALeaderboard,
  showGloryLeaderboard,
  setShowGloryLeaderboard,
  loadingLB,
  genderFilter,
  setGenderFilter,
  filteredWraLeaderboard,
  filteredGloryLeaderboard,
}: LeaderboardModalsProps) {
  const { theme, mode } = useTheme();

  return (
    <>
{/* Global Well-Rounded Leaderboard Modal */}
      <Modal
        visible={showWRALeaderboard}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWRALeaderboard(false)}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: mode === 'dark' ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)' }]}>
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background.primary }]}>
            <View style={styles.lbModalHeader}>
              <TouchableOpacity onPress={() => setShowWRALeaderboard(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={28} color={theme.text.primary} />
              </TouchableOpacity>
              <View style={styles.modalHeaderTitle}>
                <Text style={[styles.lbTitle, { color: theme.accent, textAlign: 'center' }]}>GLOBAL WELL-ROUNDED ELITE</Text>
                <Text style={[styles.lbSub, { color: theme.text.secondary, textAlign: 'center', marginTop: 4 }]}>THE ULTIMATE VERSATILE WARRIOR</Text>
              </View>
            </View>

            {loadingLB ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <LeapLogo size={40} animated />
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, marginTop: 16, gap: 12 }}>
                  {['ALL', 'MALE', 'FEMALE'].map((filter) => (
                    <TouchableOpacity
                      key={filter}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        backgroundColor: genderFilter === filter ? theme.accent : 'rgba(255,255,255,0.05)',
                        borderWidth: 1,
                        borderColor: genderFilter === filter ? theme.accent : 'rgba(255,255,255,0.1)'
                      }}
                      onPress={() => setGenderFilter(filter as any)}
                    >
                      <Text style={{ 
                        fontSize: 12, 
                        fontWeight: '900', 
                        color: genderFilter === filter ? '#FFF' : theme.text.secondary 
                      }}>
                        {filter}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {filteredWraLeaderboard.map((entry) => (
                  <View
                    key={entry.user_id}
                    style={[
                      styles.lbRow,
                      {
                        backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
                      },
                      entry.is_current_user && {
                        backgroundColor: mode === 'dark' ? `${theme.accent}20` : `${theme.accent}15`,
                        borderColor: theme.accent
                      }
                    ]}
                  >
                    <View style={styles.lbRankBox}>
                      <Text style={[styles.lbRankText, { color: entry.rank <= 3 ? theme.accent : theme.text.tertiary }]}>
                        #{entry.rank}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lbName, { color: theme.text.primary }]}>
                        {getCountryFlag(entry.country)} {entry.display_name?.toUpperCase()}
                      </Text>
                      <View style={styles.lbBreakdown}>
                        <View style={styles.lbBreakdownItem}>
                          <View style={[styles.lbDot, { backgroundColor: '#9FC5E8' }]} />
                          <Text style={[styles.lbBreakdownText, { color: theme.text.secondary }]}>{Number(entry.static_pts || 0).toFixed(2)}S</Text>
                        </View>
                        <View style={styles.lbBreakdownItem}>
                          <View style={[styles.lbDot, { backgroundColor: '#FF5722' }]} />
                          <Text style={[styles.lbBreakdownText, { color: theme.text.secondary }]}>{Number(entry.power_pts || 0).toFixed(2)}P</Text>
                        </View>
                        <View style={styles.lbBreakdownItem}>
                          <View style={[styles.lbDot, { backgroundColor: '#4CAF50' }]} />
                          <Text style={[styles.lbBreakdownText, { color: theme.text.secondary }]}>{Number(entry.endurance_pts || 0).toFixed(2)}E</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.lbScoreBox}>
                      <Text style={[styles.lbScoreText, { color: theme.accent }]}>{Number(entry.total_score || 0).toFixed(2)}</Text>
                      <Text style={[styles.lbScoreLabel, { color: theme.text.tertiary }]}>PTS</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Global Glory Leaderboard Modal */}
      <Modal
        visible={showGloryLeaderboard}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGloryLeaderboard(false)}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: mode === 'dark' ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)' }]}>
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background.primary }]}>
            <View style={styles.lbModalHeader}>
              <TouchableOpacity onPress={() => setShowGloryLeaderboard(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={28} color={theme.text.primary} />
              </TouchableOpacity>
              <View style={styles.modalHeaderTitle}>
                <Text style={[styles.lbTitle, { color: '#FF5252', textAlign: 'center' }]}>GLOBAL GLORY RANKINGS</Text>
                <Text style={[styles.lbSub, { color: theme.text.secondary, textAlign: 'center', marginTop: 4 }]}>THE LEGENDS OF THE ARENA</Text>
              </View>
            </View>

            {loadingLB ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <LeapLogo size={40} animated />
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, marginTop: 16, gap: 12 }}>
                  {['ALL', 'MALE', 'FEMALE'].map((filter) => (
                    <TouchableOpacity
                      key={filter}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        backgroundColor: genderFilter === filter ? '#FF5252' : 'rgba(255,255,255,0.05)',
                        borderWidth: 1,
                        borderColor: genderFilter === filter ? '#FF5252' : 'rgba(255,255,255,0.1)'
                      }}
                      onPress={() => setGenderFilter(filter as any)}
                    >
                      <Text style={{ 
                        fontSize: 12, 
                        fontWeight: '900', 
                        color: genderFilter === filter ? '#FFF' : theme.text.secondary 
                      }}>
                        {filter}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {filteredGloryLeaderboard.map((entry) => (
                  <View
                    key={entry.user_id}
                    style={[
                      styles.lbRow,
                      {
                        backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
                      },
                      entry.is_current_user && {
                        backgroundColor: mode === 'dark' ? 'rgba(255, 82, 82, 0.2)' : 'rgba(255, 82, 82, 0.1)',
                        borderColor: '#FF5252'
                      }
                    ]}
                  >
                    <View style={styles.lbRankBox}>
                      <Text style={[styles.lbRankText, { color: entry.rank <= 3 ? '#FF5252' : theme.text.tertiary }]}>
                        #{entry.rank}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lbName, { color: theme.text.primary }]}>
                        {getCountryFlag(entry.country)} {entry.display_name?.toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.lbScoreBox}>
                      <Text style={[styles.lbScoreText, { color: '#FF5252' }]}>{entry.total_score}</Text>
                      <Text style={[styles.lbScoreLabel, { color: theme.text.tertiary }]}>GLORY</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      
    </>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    margin: 12,
    marginTop: 60,
    marginBottom: 40,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  lbModalHeader: {
    padding: 24,
    paddingTop: 32,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    position: 'relative',
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
  },
  modalHeaderTitle: {
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 48,
  },
  lbTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'BarlowCondensed-ExtraBold',
  },
  lbSub: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  lbRankBox: {
    width: 48,
    alignItems: 'flex-start',
  },
  lbRankText: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'BarlowCondensed-ExtraBold',
  },
  lbName: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1,
  },
  lbScoreBox: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  lbScoreText: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'BarlowCondensed-ExtraBold',
  },
  lbScoreLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    marginTop: -2,
  },
  lbBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  lbBreakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lbDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lbBreakdownText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
});
