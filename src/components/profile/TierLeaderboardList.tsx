import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LeaderboardEntry, formatLeaderboardTime } from '../../lib/leaderboard';
import { getCountryFlag } from '../../constants/countries';
import { LeaderboardSkeleton } from '../LeaderboardSkeleton';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { WORLD_THEMES, worldRgba } from '../../../constants/worldThemes';

const W = WORLD_THEMES.strength;

// Design handoff: tinted numeric rank badges instead of medal emoji, so all
// ranks read consistently. Gold / silver / bronze tints for the podium,
// accent tint for everyone else.
const RANK_BADGE_TINTS: Record<number, string> = {
  1: 'rgba(255,200,60,0.25)',
  2: 'rgba(200,205,215,0.22)',
  3: 'rgba(205,127,50,0.25)',
};
const RANK_BADGE_COLORS: Record<number, string> = {
  1: '#FFC83C',
  2: '#C8CDD7',
  3: '#CD7F32',
};

function RankBadge({ rank, theme }: { rank: number; theme: any }) {
  return (
    <View
      style={[
        styles.rankBadge,
        { backgroundColor: RANK_BADGE_TINTS[rank] ?? worldRgba(W.accent, 0.14) },
      ]}
    >
      <Text style={[styles.rankBadgeNumber, { color: RANK_BADGE_COLORS[rank] ?? theme.text.secondary }]}>
        {rank}
      </Text>
    </View>
  );
}

interface TierLeaderboardListProps {
  scrollRef?: React.RefObject<ScrollView | null>;
  entries: LeaderboardEntry[];
  // Strength entries carry a hold time in best_time_seconds (lower ranks
  // first — get_tier_leaderboard sorts ASC); Power reuses the same field
  // for power_points (higher ranks first — getPowerTierLeaderboard sorts
  // DESC). Formatting and the "gap to next rank" sign both depend on which.
  category?: 'strength' | 'power';
  currentUserId?: string;
  loading: boolean;
  theme: any;
  hasCommunity?: boolean;
  leaderboardScope?: 'public' | 'community';
  onLeaderboardScopeChange?: (scope: 'public' | 'community') => void;
}

export function TierLeaderboardList({
  scrollRef,
  entries,
  category = 'strength',
  currentUserId,
  loading,
  theme,
  hasCommunity,
  leaderboardScope = 'public',
  onLeaderboardScopeChange,
}: TierLeaderboardListProps) {
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  // useScreenMeasure=true: see useTutorialTarget's own comment.
  const { ref: firstRowRef, onLayout: onFirstRowLayout } = useTutorialTarget('strength.leaderboardFirstRow', scrollRef, true);

  const formatValue = (v: number) => category === 'power' ? `${Math.round(v)}` : formatLeaderboardTime(v).replace(':', "'") + '"';
  const valueLabel = category === 'power' ? 'PTS' : 'TIME';

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

      {/* Community Scope — directly above the gender filter, same row
          rhythm, so the two filters read as one group. */}
      {hasCommunity && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10, marginTop: 2, gap: 10 }}>
          {(['public', 'community'] as const).map((scope) => (
            <TouchableOpacity
              key={scope}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 16,
                borderRadius: 20,
                backgroundColor: leaderboardScope === scope ? theme.accent : 'rgba(255,255,255,0.05)',
                borderWidth: 1,
                borderColor: leaderboardScope === scope ? theme.accent : 'rgba(255,255,255,0.1)'
              }}
              onPress={() => onLeaderboardScopeChange && onLeaderboardScopeChange(scope)}
            >
              <Text style={{
                fontSize: 12,
                fontWeight: '900',
                color: leaderboardScope === scope ? '#FFF' : theme.text.secondary
              }}>
                {scope === 'public' ? 'PUBLIC' : 'MY COMMUNITY'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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
          <Text style={[styles.emptySubtext, { color: theme.text.tertiary }]}>
            {category === 'power' ? 'Be the first to claim a score and become the King of this tier!' : 'Be the first to claim a time and become the King of this tier!'}
          </Text>
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
            // Strength ranks ascending (lower time wins) so the entry ahead
            // of you has a smaller value — gap is current minus next.
            // Power ranks descending (higher points wins), so it's the
            // other way around: the entry ahead of you has a bigger value.
            const gapValue = showGap && nextEntry
              ? category === 'power'
                ? `-${formatValue((nextEntry.best_time_seconds || 0) - (currentUserEntry!.best_time_seconds || 0))}`
                : `-${formatLeaderboardTime((currentUserEntry!.best_time_seconds || 0) - (nextEntry.best_time_seconds || 0))}`
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
                  ref={index === 0 ? firstRowRef : undefined}
                  onLayout={index === 0 ? onFirstRowLayout : undefined}
                  style={[
                    styles.entryRow,
                    entryIsCU && styles.entryRowCurrentUser,
                    (entry.rank ?? 0) <= 3 && styles.entryRowTopThree,
                  ]}
                >
                  {/* Rank badge — a plain tinted number, never emoji */}
                  <RankBadge rank={entry.rank ?? 0} theme={theme} />

                  {/* Name */}
                  <View style={[styles.entryInfo, { flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 16, marginRight: 6 }}>{getCountryFlag(entry.country)}</Text>
                    <Text
                      style={[
                        styles.entryName,
                        { color: entryIsCU ? W.accent : theme.text.secondary },
                        entryIsCU && styles.entryNameCurrentUser,
                      ]}
                      numberOfLines={1}
                    >
                      @{entry.display_name}
                    </Text>
                    {entryIsCU && <Text style={[styles.youBadge, { backgroundColor: W.accent }]}>YOU</Text>}
                  </View>

                  {/* Value pill (+ gap pill for the current user when not #1) */}
                  <View style={styles.timeCirclesContainer}>
                    <View style={[styles.valuePill, { backgroundColor: worldRgba(W.accent, 0.14) }]}>
                      <Text style={[styles.valuePillText, { color: W.accent }]}>
                        {formatValue(entry.best_time_seconds)}
                      </Text>
                    </View>
                    {showGap && gapValue && (
                      <View style={[styles.valuePill, { backgroundColor: worldRgba(W.accent, 0.24) }]}>
                        <Text style={[styles.valuePillText, { color: W.accent }]}>{gapValue} GAP</Text>
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
                  <RankBadge rank={index + 1} theme={theme} />
                  <View style={styles.entryInfo}>
                    <Text
                      style={[
                        styles.entryName,
                        { color: isCU(entry) ? W.accent : theme.text.secondary },
                        isCU(entry) && styles.entryNameCurrentUser,
                      ]}
                      numberOfLines={1}
                    >
                      <Text style={{ fontSize: 16 }}>{getCountryFlag(entry.country)} </Text>
                      @{entry.display_name}
                    </Text>
                    {isCU(entry) && (
                      <Text style={[styles.youBadge, { backgroundColor: W.accent }]}>YOU</Text>
                    )}
                  </View>
                  <View style={[styles.valuePill, { backgroundColor: worldRgba(W.accent, 0.14) }]}>
                    <Text style={[styles.valuePillText, { color: W.accent }]}>
                      {formatValue(entry.best_time_seconds)}{category === 'power' ? ' PTS' : ''}
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
    minHeight: 52,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: worldRgba(W.accent, 0.1),
    marginBottom: 5,
    gap: 4,
  },
  entryRowCurrentUser: {
    backgroundColor: worldRgba(W.accent, 0.15),
    borderColor: W.accent,
  },
  entryRowTopThree: {
    borderColor: worldRgba(W.accent, 0.4),
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeNumber: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
  },
  valuePill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valuePillText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
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
  closeButtonText: {
    fontSize: 18,
  },
});
