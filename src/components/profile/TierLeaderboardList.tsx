import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LeaderboardEntry, formatLeaderboardTime } from '../../lib/leaderboard';
import { getCountryFlag } from '../../constants/countries';
import { LeaderboardSkeleton } from '../LeaderboardSkeleton';

interface TierLeaderboardListProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  loading: boolean;
  theme: any;
}

export function TierLeaderboardList({ entries, currentUserId, loading, theme }: TierLeaderboardListProps) {
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  const isCU = (entry: LeaderboardEntry) => entry.is_current_user || (!!currentUserId && entry.user_id === currentUserId);

  const filteredEntries = React.useMemo(() => {
    let list = entries;
    if (genderFilter !== 'ALL') {
      list = entries.filter(e => (e.gender || '').toUpperCase() === genderFilter);
    }
    return list.map((e, index) => ({ ...e, rank: index + 1 }));
  }, [entries, genderFilter]);

  const currentUserEntry = filteredEntries.find(isCU);

  return (
    <>
      {/* marginHorizontal:16 matches the inset every sibling card/button on
          this screen already uses (WarriorCard, SuggestedTestCard,
          QuickStatsRow) — this component previously relied on entryRow's own
          internal padding for its horizontal gutter, which read edge-to-edge
          and larger than everything around it. */}
      <View style={{ marginHorizontal: 16 }}>
      {/* Warriors Headline */}
      <View style={[styles.warriorsHeadline, { borderBottomColor: theme.card.border }]}>
        <Text style={[styles.headlineTitleBig, { color: theme.accent }]}>LEADERBOARD</Text>
        <Text style={[styles.headlineSubtitle, { color: theme.text.secondary }]}>
          {filteredEntries.length} WARRIORS
        </Text>
      </View>

      {/* Gender Filters */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 12, marginTop: 2, gap: 10 }}>
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

      {/* Leaderboard List */}
      {loading ? (
        <LeaderboardSkeleton />
      ) : filteredEntries.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="shield-outline" size={64} color={theme.accent} style={{ marginBottom: 16, opacity: 0.5 }} />
          <Text style={[styles.emptyText, { color: theme.text.primary }]}>No warriors have attempted this tier yet.</Text>
          <Text style={[styles.emptySubtext, { color: theme.text.tertiary }]}>Be the first to claim a time and become the King of this tier!</Text>
        </View>
      ) : (
        <View style={styles.listPreview}>
          {(() => {
            const top3 = filteredEntries.slice(0, 3);
            const currentUserInTop3 = currentUserEntry && (currentUserEntry.rank ?? 0) <= 3;
            const previewEntries = currentUserEntry && !currentUserInTop3
              ? [...top3, currentUserEntry]
              : top3;
            return previewEntries;
          })().map((entry, index) => {
            const entryIsCU = isCU(entry);
            const currentUserInTop3 = currentUserEntry && (currentUserEntry.rank ?? 0) <= 3;
            const isSeparatorRow = entryIsCU && !currentUserInTop3 && index === 3;
            const showGap = entryIsCU && currentUserEntry && currentUserEntry.rank && currentUserEntry.rank > 1;
            const nextEntry = showGap ? filteredEntries.find(e => e.rank === currentUserEntry!.rank! - 1) : null;
            const gapValue = showGap && nextEntry
              ? `-${formatLeaderboardTime((currentUserEntry!.best_time_seconds || 0) - (nextEntry.best_time_seconds || 0))}`
              : null;

            return (
              <View key={entry.user_id}>
                {isSeparatorRow && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 6, paddingHorizontal: 4 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: `${theme.accent}4D` }} />
                    <Text style={{ color: `${theme.accent}80`, fontSize: 10, marginHorizontal: 8, letterSpacing: 1 }}>YOUR RANK</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: `${theme.accent}4D` }} />
                  </View>
                )}
                <View
                  style={[
                    styles.entryRow,
                    entryIsCU && styles.entryRowCurrentUser,
                    (entry.rank ?? 0) <= 3 && styles.entryRowTopThree,
                  ]}
                >
                  {/* Rank - Medal or Number */}
                  <View style={styles.rankContainer}>
                    {entry.rank === 1 && <Text style={styles.medal}>🥇</Text>}
                    {entry.rank === 2 && <Text style={styles.medal}>🥈</Text>}
                    {entry.rank === 3 && <Text style={styles.medal}>🥉</Text>}
                    {(entry.rank ?? 0) > 3 && (
                      <View style={[styles.rankCircle, { borderColor: entryIsCU ? theme.accent : theme.card.border }]}>
                        <Text style={[styles.rankNumber, { color: entryIsCU ? theme.accent : theme.text.tertiary }]}>{entry.rank}</Text>
                      </View>
                    )}
                  </View>

                  {/* Name */}
                  <View style={[styles.entryInfo, { flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 16, marginRight: 6 }}>{getCountryFlag(entry.country)}</Text>
                    <Text
                      style={[
                        styles.entryName,
                        { color: entryIsCU ? theme.accent : theme.text.secondary },
                        entryIsCU && styles.entryNameCurrentUser,
                      ]}
                      numberOfLines={1}
                    >
                      @{entry.display_name}
                    </Text>
                    {entryIsCU && <Text style={[styles.youBadge, { backgroundColor: theme.accent }]}>YOU</Text>}
                  </View>

                  {/* Time Circles - Side by Side */}
                  <View style={styles.timeCirclesContainer}>
                    {/* Best Time Circle */}
                    <View style={[styles.timeCircle, { backgroundColor: `${theme.accent}1A`, borderColor: theme.accent }]}>
                      <Text style={[styles.timeCircleValue, { color: theme.accent }]}>
                        {formatLeaderboardTime(entry.best_time_seconds).replace(':', "'") + '"'}
                      </Text>
                      <Text style={[styles.timeCircleLabel, { color: theme.accent }]}>TIME</Text>
                    </View>

                    {/* Gap Circle (only for current user when not #1) */}
                    {showGap && gapValue && (
                      <View style={[styles.gapCircle, { backgroundColor: `${theme.accent}26`, borderColor: theme.accent }]}>
                        <Text style={[styles.gapCircleValue, { color: theme.accent }]}>{gapValue}</Text>
                        <Text style={[styles.gapCircleLabel, { color: theme.accent }]}>GAP</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* See More Button */}
      {filteredEntries.length > 3 && (
        <TouchableOpacity
          style={styles.seeMoreButton}
          onPress={() => setShowLeaderboardModal(true)}
        >
          <Text style={[styles.seeMoreText, { color: theme.accent }]}>SEE MORE</Text>
        </TouchableOpacity>
      )}
      </View>

      {/* Full Leaderboard Modal */}
      <Modal
        visible={showLeaderboardModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLeaderboardModal(false)}
      >
        <View style={styles.fullLeaderboardOverlay}>
          <View style={[styles.fullLeaderboardContent, { backgroundColor: theme.background.primary }]}>
            <View style={styles.fullLeaderboardHeader}>
              <Text style={[styles.fullLeaderboardTitle, { color: theme.accent }]}>LEADERBOARD</Text>
              <TouchableOpacity onPress={() => setShowLeaderboardModal(false)}>
                <Text style={[styles.closeButtonText, { color: theme.text.tertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              style={styles.fullLeaderboardList}
              data={filteredEntries}
              keyExtractor={item => item.user_id}
              showsVerticalScrollIndicator={false}
              getItemLayout={(_, index) => ({ length: 73, offset: 73 * index, index })}
              initialScrollIndex={Math.max(0, (filteredEntries.findIndex(isCU)) - 2)}
              renderItem={({ item: entry, index }) => (
                <View
                  style={[
                    styles.entryRow,
                    isCU(entry) && styles.entryRowCurrentUser,
                    index < 3 && styles.entryRowTopThree,
                  ]}
                >
                  <View style={styles.rankContainer}>
                    {index === 0 && <Text style={styles.medal}>🥇</Text>}
                    {index === 1 && <Text style={styles.medal}>🥈</Text>}
                    {index === 2 && <Text style={styles.medal}>🥉</Text>}
                    {index > 2 && (
                      <View style={[styles.rankCircle, { borderColor: isCU(entry) ? theme.accent : theme.card.border }]}>
                        <Text style={[styles.rankNumber, { color: isCU(entry) ? theme.accent : theme.text.tertiary }]}>{entry.rank}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.entryInfo}>
                    <Text
                      style={[
                        styles.entryName,
                        { color: isCU(entry) ? theme.accent : theme.text.secondary },
                        isCU(entry) && styles.entryNameCurrentUser,
                      ]}
                      numberOfLines={1}
                    >
                      <Text style={{ fontSize: 16 }}>{getCountryFlag(entry.country)} </Text>
                      @{entry.display_name}
                    </Text>
                    {isCU(entry) && (
                      <Text style={[styles.youBadge, { backgroundColor: theme.accent }]}>YOU</Text>
                    )}
                  </View>
                  <View style={styles.timeContainer}>
                    <Text style={[styles.entryTime, { color: theme.accent }]}>
                      {formatLeaderboardTime(entry.best_time_seconds)}
                    </Text>
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  warriorsHeadline: {
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    marginBottom: 6,
  },
  headlineTitleBig: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  headlineSubtitle: {
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#FF5252',
    marginTop: 8,
  },
  listPreview: {
    maxHeight: 500,
    flexGrow: 0,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.1)',
    marginBottom: 5,
  },
  entryRowCurrentUser: {
    backgroundColor: 'rgba(255,82,82,0.15)',
    borderColor: '#FF5252',
  },
  entryRowTopThree: {
    borderColor: 'rgba(255,82,82,0.4)',
  },
  rankContainer: {
    width: 24,
    alignItems: 'center',
  },
  medal: {
    fontSize: 15,
  },
  rankCircle: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
  entryInfo: {
    flex: 1,
    marginLeft: 6,
  },
  entryName: {
    flexShrink: 1,
    fontSize: 11,
    color: '#FF5252',
  },
  entryNameCurrentUser: {
    fontWeight: '700',
  },
  youBadge: {
    fontSize: 9,
    color: '#000',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    marginLeft: 6,
    fontWeight: '800',
    alignSelf: 'center',
  },
  timeCirclesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeCircle: {
    width: 50,
    height: 50,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeCircleValue: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  timeCircleLabel: {
    fontSize: 7,
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  gapCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapCircleValue: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    textAlign: 'center',
  },
  gapCircleLabel: {
    fontSize: 8,
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  seeMoreButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 23,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 82, 82, 0.2)',
    marginTop: 8,
    marginBottom: 12,
  },
  seeMoreText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  fullLeaderboardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fullLeaderboardContent: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 20,
    padding: 20,
  },
  fullLeaderboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullLeaderboardTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  fullLeaderboardList: {
    maxHeight: 400,
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  entryTime: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FF5252',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(255,82,82,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  closeButtonText: {
    fontSize: 18,
  },
});
