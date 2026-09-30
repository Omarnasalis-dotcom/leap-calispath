import React from 'react';
import { Text, View } from 'react-native';
import { KitButton, KitIcon, kt } from '../../components/worlds/kit';
import { WeeklyTokens } from '../../components/weekly/weeklyTokens';
import { Label, StatusPill, TwoStatCard, closesInLabel, formatGap, formatScore } from '../../components/weekly/WeeklyParts';
import { ScoringType } from '../../lib/weeklyChallenge';
import { t as tr } from '../../i18n';

/** What the Submitted screen reports, captured when the RPC returns. */
export interface LastResult {
  score: number;
  /** The server kept this score (first entry or better than the old best). */
  newBest: boolean;
  /** Rank before this submission; null when it was the first entry. */
  prevRank: number | null;
  newRank: number;
  best: number;
  /** Gap from the user's best to #1 after submitting. */
  gap: number;
}

export function ChallengeSubmitted({ tokens: t, type, weekStart, last, onBack }: {
  tokens: WeeklyTokens; type: ScoringType; weekStart: string; last: LastResult; onBack: () => void;
}) {
  let delta: string;
  let good = true;
  if (last.prevRank == null) delta = tr('weekly.firstEntry');
  else if (!last.newBest) { delta = tr('weekly.notNewBest'); good = false; }
  else if (last.prevRank > last.newRank) delta = tr('weekly.upPlaces', { count: last.prevRank - last.newRank });
  else delta = tr('weekly.newBestSameRank');

  const note = last.newRank === 1
    ? tr('weekly.holdFirst')
    : tr('weekly.gapCloses', { gap: formatGap(type, last.gap), time: closesInLabel(weekStart) });

  return (
    <View style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 20 }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: t.accentHalo, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
            <KitIcon name="check" size={30} color={t.onAccent} strokeWidth={3} />
          </View>
        </View>
        <Label tokens={t} size={11} style={{ marginTop: 26, letterSpacing: 2.4 }}>{tr('weekly.yourRankWeek')}</Label>
        <Text style={[kt('bold', 128, t.text, 0, 132), { marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>{`#${last.newRank}`}</Text>
        <StatusPill tokens={t} text={delta} good={good} style={{ marginTop: 14 }} />

        <TwoStatCard
          tokens={t}
          style={{ marginTop: 32, alignSelf: 'stretch' }}
          left={{ label: tr('weekly.thisResult'), value: formatScore(type, last.score) }}
          right={{ label: tr('weekly.yourBest'), value: formatScore(type, last.best) }}
        />
        <Text style={[kt('light', 13, t.textMuted, 0, 19), { marginTop: 18, textAlign: 'center' }]}>{note}</Text>
      </View>

      <KitButton tokens={t} label={tr('weekly.backToChallenge')} height={60} fontSize={16} onPress={onBack} />
    </View>
  );
}
