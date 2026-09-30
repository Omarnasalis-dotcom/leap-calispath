import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { KitButton, KitIcon, kt } from '../../components/worlds/kit';
import { WeeklyTokens } from '../../components/weekly/weeklyTokens';
import { Label, SquareButton, TextLink } from '../../components/weekly/WeeklyParts';
import { WeeklyChallenge } from '../../services/ChallengeService';
import { formatClock, roundPoints } from '../../lib/weeklyChallenge';
import { ltr, t as tr } from '../../i18n';

interface Props {
  tokens: WeeklyTokens;
  challenge: WeeklyChallenge;
  /** Seconds since the timer started (0 during the countdown). */
  elapsed: number;
  /** 3 · 2 · 1 before the clock starts; null once it's running. */
  countdown: number | null;
  /** For time: index of the current movement. */
  step: number;
  /** AMRAP: live round counter. */
  rounds: number;
  onStepDone: () => void;
  onRound: () => void;
  onEndAmrap: () => void;
  onClose: () => void;
}

function ForTimeSteps({ tokens: t, challenge, step }: { tokens: WeeklyTokens; challenge: WeeklyChallenge; step: number }) {
  return (
    <View style={{ gap: 8 }}>
      {challenge.movements.map((m, i) => {
        const done = i < step;
        const cur = i === step;
        return (
          <View key={`${m.name}-${i}`} style={{
            flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: cur ? 84 : 52, paddingHorizontal: 16,
            borderRadius: 16, opacity: done ? 0.55 : 1,
            backgroundColor: cur ? t.liveBg : done ? t.boardBg : t.card,
            borderWidth: cur ? 1.5 : 1, borderColor: cur ? t.accent : done ? t.divider : t.border,
          }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: done ? t.greenSoft : cur ? t.accent : t.button,
            }}>
              {done
                ? <KitIcon name="check" size={14} color={t.green} strokeWidth={2.8} />
                : <Text style={kt('bold', 12, cur ? t.onAccent : t.textMuted)}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {cur && <Text style={kt('semibold', 10.5, t.accentText, 2)}>{tr('weekly.now')}</Text>}
              <Text
                style={[kt(cur ? 'semibold' : 'medium', cur ? 24 : 16, done ? t.textDim : t.text, 0.4), done && { textDecorationLine: 'line-through' }]}
                numberOfLines={1}
                adjustsFontSizeToFit={cur}
              >
                {m.name}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={kt('semibold', cur ? 34 : 18, t.text, 0, cur ? 36 : 20)}>{m.reps}</Text>
              <Text style={kt('medium', 11, t.textMuted, 1.2)}>{tr('weekly.repsUnit')}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AmrapCard({ tokens: t, challenge, rounds }: { tokens: WeeklyTokens; challenge: WeeklyChallenge; rounds: number }) {
  return (
    <View style={{ borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, padding: 20, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Label tokens={t} size={11}>{tr('weekly.roundsDone')}</Label>
          <Text style={[kt('bold', 68, t.text, 0, 70), { marginTop: 4 }]}>{rounds}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Label tokens={t} size={11}>{tr('weekly.nowOn')}</Label>
          <Text style={[kt('semibold', 20, t.accentText, 1.4), { marginTop: 2 }]}>{tr('weekly.roundN', { n: rounds + 1 })}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {challenge.movements.map((m, i) => (
          <View key={`${m.name}-${i}`} style={{ width: '48.5%', flexGrow: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.tile }}>
            <Text style={kt('regular', 12.5, t.textDim, 0.4)} numberOfLines={1}>{m.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
              <Text style={kt('semibold', 20, t.text)}>{m.reps}</Text>
              <Text style={kt('medium', 10.5, t.textMuted, 1.2)}>{tr('weekly.repsUnit')}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ChallengeActive({ tokens: t, challenge, elapsed, countdown, step, rounds, onStepDone, onRound, onEndAmrap, onClose }: Props) {
  const amrap = challenge.scoring_type === 'reps';
  const cap = (challenge.time_limit || 10) * 60;
  const n = challenge.movements.length;
  const counting = countdown != null;

  const timerText = amrap ? formatClock(Math.ceil(cap - elapsed)) : formatClock(elapsed);
  const progress = amrap ? Math.min(1, elapsed / cap) : n ? step / n : 0;
  const caption = amrap
    ? tr('weekly.roundsPts', { rounds, pts: rounds * roundPoints(challenge.movements) })
    : tr('weekly.movementsDone', { done: step, total: n });

  const last = step >= n - 1;
  const cta = amrap
    ? tr('weekly.plusRound')
    : last ? tr('weekly.finish') : tr('weekly.doneNext', { name: challenge.movements[step + 1]?.name.toUpperCase() ?? '' });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingHorizontal: 24 }}>
        <SquareButton tokens={t} icon="close" label={tr('weekly.close')} onPress={onClose} iconColor={t.textSecondary} />
        <View style={{ flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 8 }}>
          <Text style={kt('semibold', 12, t.accentText, 3)}>
            {amrap ? tr('weekly.chipAmrap', { min: challenge.time_limit || 10 }) : tr('weekly.chipForTime')}
          </Text>
          <Text style={kt('semibold', 15, t.text, 1.6)} numberOfLines={1}>{challenge.title.toUpperCase()}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ alignItems: 'center', paddingTop: 30, paddingHorizontal: 24 }}>
        <Label tokens={t} size={11} style={{ letterSpacing: 2.4 }}>
          {counting ? tr('weekly.getReadyShort') : amrap ? tr('weekly.timeLeft') : tr('weekly.elapsed')}
        </Label>
        <Text
          style={[kt('bold', 96, counting ? t.accentText : t.text, 2, 100), { marginTop: 6, fontVariant: ['tabular-nums'] }]}
          accessibilityLiveRegion={counting ? 'assertive' : 'none'}
        >
          {counting ? String(countdown) : ltr(timerText)}
        </Text>
        <View style={{ width: '100%', height: 4, borderRadius: 2, backgroundColor: t.cardBorder, marginTop: 20, overflow: 'hidden' }}>
          <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: t.accent }} />
        </View>
        <Text style={[kt('medium', 12, t.textSecondary, 1.6), { marginTop: 10 }]}>{caption}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 26, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {amrap
          ? <AmrapCard tokens={t} challenge={challenge} rounds={rounds} />
          : <ForTimeSteps tokens={t} challenge={challenge} step={step} />}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: 20, gap: 14 }}>
        <KitButton
          tokens={t}
          label={cta}
          height={60}
          fontSize={16}
          disabled={counting}
          onPress={amrap ? onRound : onStepDone}
        />
        {amrap && <TextLink tokens={t} label={tr('weekly.endAndLog')} onPress={counting ? () => {} : onEndAmrap} />}
      </View>
    </View>
  );
}
