import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { KitButton, kt } from '../../components/worlds/kit';
import { WeeklyTokens } from '../../components/weekly/weeklyTokens';
import { Label, StatusPill, StepButton, TextLink, TwoStatCard, formatGap } from '../../components/weekly/WeeklyParts';
import { WeeklyChallenge } from '../../services/ChallengeService';
import { clampPartial, formatClock, partialPoints, roundPoints } from '../../lib/weeklyChallenge';
import { ltr, t as tr } from '../../i18n';

/** Where the score being logged would land (computed before submitting). */
export interface Projection {
  rank: number;
  count: number;
  /** ≥ 0; 0 with rank 1 means KING. */
  gap: number;
}

interface Common {
  tokens: WeeklyTokens;
  challenge: WeeklyChallenge;
  previousBest: number | null;
  projection: Projection;
  submitting: boolean;
  onSubmit: () => void;
  onDiscard: () => void;
}

export function ChallengeLogForTime({ tokens: t, challenge, previousBest, projection, submitting, onSubmit, onDiscard, result }: Common & { result: number }) {
  const newBest = previousBest == null || result < previousBest;
  const pill = previousBest == null
    ? tr('weekly.firstAttempt')
    : newBest
      ? tr('weekly.newBestBy', { time: ltr(formatClock(previousBest - result)) })
      : tr('weekly.bestStays', { best: ltr(formatClock(previousBest)) });

  return (
    <View style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 20 }}>
      <View style={{ alignItems: 'center', paddingTop: 110 }}>
        <Text style={[kt('semibold', 12, t.accentText, 3), { textAlign: 'center' }]}>
          {tr('weekly.finishedName', { name: challenge.title.toUpperCase() })}
        </Text>
        <Text style={[kt('bold', 112, t.text, 2, 116), { marginTop: 14, fontVariant: ['tabular-nums'] }]} numberOfLines={1} adjustsFontSizeToFit>
          {ltr(formatClock(result))}
        </Text>
        <StatusPill tokens={t} text={pill} good={previousBest == null || newBest} style={{ marginTop: 18 }} />
      </View>

      <TwoStatCard
        tokens={t}
        style={{ marginTop: 44 }}
        left={{ label: tr('weekly.thisRanks'), value: `#${projection.rank}`, sub: tr('weekly.ofCount', { count: projection.count }) }}
        right={projection.rank === 1
          ? { label: tr('weekly.statGap'), value: tr('weekly.king'), color: t.gold }
          : { label: tr('weekly.statGap'), value: formatGap('time', projection.gap) }}
      />

      <View style={{ marginTop: 'auto', gap: 14 }}>
        <KitButton tokens={t} label={tr('weekly.submitResult')} height={60} fontSize={16} loading={submitting} onPress={onSubmit} />
        <TextLink tokens={t} label={tr('weekly.discard')} onPress={onDiscard} />
      </View>
    </View>
  );
}

export function ChallengeLogAmrap({
  tokens: t, challenge, projection, submitting, onSubmit, onDiscard,
  rounds, partial, onRounds, onPartial,
}: Common & {
  rounds: number;
  partial: number[];
  onRounds: (n: number) => void;
  onPartial: (next: number[]) => void;
}) {
  const moves = challenge.movements;
  const rp = roundPoints(moves);
  const reps = clampPartial(moves, partial);
  const partPts = partialPoints(moves, reps);
  const total = rounds * rp + partPts;

  const setRep = (i: number, v: number) => {
    const next = [...reps];
    next[i] = v;
    onPartial(clampPartial(moves, next));
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 26, paddingBottom: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={kt('semibold', 12, t.accentText, 3)}>{tr('weekly.timesUpName', { name: challenge.title.toUpperCase() })}</Text>
          <Text style={[kt('bold', 32, t.text, 1.4, 38), { marginTop: 4 }]}>{tr('weekly.logYourScore')}</Text>
        </View>

        {/* Full rounds */}
        <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Label tokens={t} size={11}>{tr('weekly.fullRounds')}</Label>
            <Text style={kt('medium', 12, t.textMuted, 1.2)}>{tr('weekly.timesRoundPts', { pts: rp })}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <StepButton tokens={t} kind="minus" size={52} label={tr('weekly.decrease', { name: tr('weekly.fullRounds') })} disabled={rounds <= 0} onPress={() => onRounds(Math.max(0, rounds - 1))} />
            <Text style={kt('bold', 64, t.text, 0, 68)}>{rounds}</Text>
            <StepButton tokens={t} kind="plus" size={52} primary label={tr('weekly.increase', { name: tr('weekly.fullRounds') })} onPress={() => onRounds(rounds + 1)} />
          </View>
          <Text style={[kt('medium', 13, t.textSecondary, 1.4), { textAlign: 'center' }]}>
            {ltr(tr('weekly.roundsFormula', { rounds, pts: rp, total: rounds * rp }))}
          </Text>
        </View>

        {/* Unfinished round */}
        <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 8 }}>
          <Label tokens={t} size={11}>{tr('weekly.unfinishedRound')}</Label>
          <Text style={[kt('light', 12.5, t.textFaint), { marginTop: 3 }]}>{tr('weekly.unfinishedHelp')}</Text>
          <View style={{ marginTop: 8 }}>
            {moves.map((m, i) => (
              <View key={`${m.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 58, borderTopWidth: 1, borderTopColor: t.mode === 'dark' ? '#181818' : t.divider }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={kt('medium', 15, t.text)} numberOfLines={1}>{m.name}</Text>
                  <Text style={kt('medium', 11, t.textMuted, 1.2)}>{tr('weekly.ptsPerRep', { count: m.points })}</Text>
                </View>
                <StepButton tokens={t} kind="minus" size={36} label={tr('weekly.decrease', { name: m.name })} disabled={reps[i] <= 0} onPress={() => setRep(i, reps[i] - 1)} />
                <View style={{ width: 62, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2 }}>
                  <Text style={kt('semibold', 20, reps[i] ? t.text : t.textFaint)}>{reps[i]}</Text>
                  <Text style={kt('medium', 12, t.textFaint)}>{ltr(`/ ${m.reps}`)}</Text>
                </View>
                <StepButton tokens={t} kind="plus" size={36} label={tr('weekly.increase', { name: m.name })} disabled={reps[i] >= m.reps} onPress={() => setRep(i, reps[i] + 1)} />
                <Text style={[kt('semibold', 14, t.accentText), { minWidth: 34, textAlign: 'right' }]}>{ltr(`+${reps[i] * m.points}`)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Total */}
        <View style={{ borderRadius: 20, backgroundColor: t.liveBg, borderWidth: 1, borderColor: t.liveBorder, padding: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexShrink: 1 }}>
            <Label tokens={t} size={11}>{tr('weekly.totalScore')}</Label>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <Text style={kt('bold', 44, t.text, 0, 48)}>{total}</Text>
              <Text style={kt('semibold', 14, t.accentText, 1.4)}>{tr('weekly.ptsUnit')}</Text>
            </View>
            <Text style={kt('medium', 11.5, t.textMuted, 1.2)}>
              {ltr(tr('weekly.totalBreakdown', { rounds, roundPts: rounds * rp, partPts }))}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={kt('semibold', 16, t.text, 1.2)}>{tr('weekly.ranksN', { rank: `#${projection.rank}` })}</Text>
            <Text style={kt('regular', 12, t.textFaint)}>{tr('weekly.ofCount', { count: projection.count })}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 20, gap: 14, borderTopWidth: 1, borderTopColor: t.pillTrack }}>
        <KitButton tokens={t} label={tr('weekly.submitScore')} height={60} fontSize={16} loading={submitting} disabled={total <= 0} onPress={onSubmit} />
        <TextLink tokens={t} label={tr('weekly.discard')} onPress={onDiscard} />
      </View>
    </View>
  );
}

