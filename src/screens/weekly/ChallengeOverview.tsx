import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Text as SvgText } from 'react-native-svg';
import { KitButton, kt, Gender, Scope } from '../../components/worlds/kit';
import { WORLD_FONTS } from '../../../constants/worldKitTokens';
import { WeeklyTokens } from '../../components/weekly/weeklyTokens';
import { Label, SquareButton, WeeklyHeader, formatGap, formatScoreShort, formatScore, closesInLabel } from '../../components/weekly/WeeklyParts';
import { WeeklyBoard } from '../../components/weekly/WeeklyBoard';
import { WeeklyChallenge, WeeklyBoardRow } from '../../services/ChallengeService';
import { GROUP_LEVEL, formatClock, isoWeekNumber, roundPoints, totalReps, weekEndDate, parseWeekStart } from '../../lib/weeklyChallenge';
import { LeapLogo } from '../../components/LeapLogo';
import { isArabic, ltr, t as tr } from '../../i18n';

const GROUP_KEYS = { 1: 'weekly.novices', 2: 'weekly.warriors', 3: 'weekly.legends' } as const;
const GROUP_RANGES = { 1: '0–2', 2: '3–6', 3: '7–9' } as const;
const LEVEL_KEYS = { beginner: 'weekly.levelBeginner', intermediate: 'weekly.levelIntermediate', advanced: 'weekly.levelAdvanced' } as const;

export interface MyStanding {
  best: number | null;
  rank: number | null;
  count: number;
  gap: number | null;
}

interface Props {
  tokens: WeeklyTokens;
  challenge: WeeklyChallenge | null;
  group: 1 | 2 | 3;
  weekStart: string;
  live: boolean;
  loading: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  onStart: () => void;
  standing: MyStanding;
  boardRows: WeeklyBoardRow[];
  myId?: string;
  myName: string;
  showAll: boolean;
  onToggleAll: () => void;
  inCommunity: boolean;
  scope: Scope;
  onScope: (s: Scope) => void;
  gender: Gender;
  onGender: (g: Gender) => void;
  /** Admin-only extras (group tabs + manage button), unchanged from before. */
  adminSlot?: React.ReactNode;
  /** SOLO | TEAM switch, when Team Challenge is on. */
  modeSlot?: React.ReactNode;
  onManage?: () => void;
}

function rangeLabel(weekStart: string): string {
  const fmt = (d: Date) => d.toLocaleDateString(isArabic ? 'ar' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(parseWeekStart(weekStart))} – ${fmt(weekEndDate(weekStart))}`.toUpperCase();
}

function Hero({ tokens: t, challenge, group, weekStart, live, standing }: {
  tokens: WeeklyTokens; challenge: WeeklyChallenge; group: 1 | 2 | 3; weekStart: string; live: boolean; standing: MyStanding;
}) {
  const type = challenge.scoring_type;
  const amrap = type === 'reps';
  const capMin = challenge.time_limit || 10;
  const ranked = standing.rank != null;
  const king = standing.rank === 1;
  const stat = (color: string) => kt('semibold', 17, color, 0, 21);
  // Some real titles already name the level ("100 Challenge Intermediate"); don't say it twice.
  const titleHasLevel = challenge.title.toLowerCase().includes(GROUP_LEVEL[group]);

  return (
    <View style={{
      marginTop: 12, borderRadius: 20, padding: 14, overflow: 'hidden',
      backgroundColor: live ? t.liveBg : t.card, borderWidth: 1, borderColor: live ? t.liveBorder : t.cardBorder,
    }}>
      {/* Ghost week number — decoration only. */}
      <View pointerEvents="none" style={{ position: 'absolute', end: -6, top: -30 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={230} height={190}>
          <SvgText
            x={230} y={160} textAnchor="end"
            fontFamily={WORLD_FONTS.bold} fontSize={170} letterSpacing={-4}
            fill="none" stroke={live ? t.ghostLive : t.ghostEnded} strokeWidth={1.5}
          >
            {String(isoWeekNumber(weekStart))}
          </SvgText>
        </Svg>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: t.borderStrong, flexShrink: 1 }}>
          <Text style={kt('semibold', 10.5, t.textSecondary, 1.6)} numberOfLines={1}>
            {tr('weekly.division', { group: tr(GROUP_KEYS[group]), range: ltr(GROUP_RANGES[group]) })}
          </Text>
        </View>
        <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.accent }}>
          <Text style={kt('bold', 10.5, t.onAccent, 1.6)}>
            {amrap ? tr('weekly.chipAmrap', { min: capMin }) : tr('weekly.chipForTime')}
          </Text>
        </View>
      </View>

      <Text style={[kt('bold', 26, t.text, 1, 30), { marginTop: 10 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
        {challenge.title.toUpperCase()}
      </Text>
      {!titleHasLevel && (
        <Text style={[kt('medium', 12, t.textMuted, 3), { marginTop: 8 }]}>{tr(LEVEL_KEYS[GROUP_LEVEL[group]])}</Text>
      )}
      <Text style={[kt('light', 12.5, t.textSecondary, 0, 18), { marginTop: 6 }]}>
        {amrap ? tr('weekly.ruleAmrap', { cap: ltr(formatClock(capMin * 60)) }) : tr('weekly.ruleForTime')}
      </Text>
      {challenge.description ? (
        <Text style={[kt('light', 13, t.textMuted, 0, 19), { marginTop: 6 }]}>{challenge.description}</Text>
      ) : null}

      <View style={{ marginTop: 10, flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.cardBorder, paddingTop: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label tokens={t}>{tr('weekly.yourBest')}</Label>
          <Text style={[stat(standing.best == null ? t.textDisabled : t.text), { marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
            {standing.best == null ? '—' : formatScoreShort(type, standing.best)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, borderStartWidth: 1, borderStartColor: t.cardBorder, paddingStart: 14 }}>
          <Label tokens={t}>{tr('weekly.statRank')}</Label>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
            <Text style={stat(ranked ? t.text : t.textDisabled)} numberOfLines={1}>{ranked ? `#${standing.rank}` : '—'}</Text>
            <Text style={[kt('regular', 11.5, t.textFaint), { flexShrink: 1 }]} numberOfLines={1}>
              {ranked ? tr('weekly.ofCount', { count: standing.count }) : tr('weekly.unrankedLower')}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, borderStartWidth: 1, borderStartColor: t.cardBorder, paddingStart: 14 }}>
          <Label tokens={t}>{tr('weekly.statGap')}</Label>
          <Text style={[stat(!ranked ? t.textDisabled : king ? t.gold : t.text), { marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
            {!ranked ? '—' : king ? tr('weekly.king') : formatGap(type, standing.gap ?? 0, false)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Movements({ tokens: t, challenge }: { tokens: WeeklyTokens; challenge: WeeklyChallenge }) {
  const amrap = challenge.scoring_type === 'reps';
  return (
    <View style={{ paddingTop: 28, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Label tokens={t} size={11}>{tr('weekly.movements')}</Label>
        <Text style={kt('medium', 12, t.textSecondary, 1.4)}>
          {amrap
            ? tr('weekly.metaAmrap', { pts: roundPoints(challenge.movements) })
            : tr('weekly.metaForTime', { reps: totalReps(challenge.movements) })}
        </Text>
      </View>
      {challenge.movements.map((m, i) => (
        <View key={`${m.name}-${i}`} style={{
          flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8,
          borderRadius: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
        }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.buttonTint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={kt('bold', 12, t.accentText)}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={kt('medium', 16, t.text, 0.4)}>{m.name}</Text>
            {amrap && <Text style={[kt('medium', 11, t.textMuted, 1.2), { marginTop: 1 }]}>{tr('weekly.ptsPerRep', { count: m.points })}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={kt('semibold', 22, t.text)}>{m.reps}</Text>
            <Text style={kt('medium', 11, t.textMuted, 1.2)}>{tr('weekly.repsUnit')}</Text>
          </View>
          {amrap && (
            <Text style={[kt('semibold', 14, t.accentText, 0.6), { minWidth: 54, textAlign: 'right' }]}>
              {tr('weekly.ptsValue', { pts: m.reps * m.points })}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export function ChallengeOverview(p: Props) {
  const t = p.tokens;
  const type = p.challenge?.scoring_type ?? 'time';
  const showCta = p.live && !!p.challenge;
  const ctaLabel = p.standing.best == null
    ? tr('weekly.startChallenge')
    : tr('weekly.startBeat', { best: formatScore(type, p.standing.best) });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <WeeklyHeader tokens={t} onBack={p.onBack} onManage={p.onManage} />

        {p.modeSlot}

        {p.adminSlot}

        {/* Week switcher — prev = older, next = newer. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20 }}>
          <SquareButton tokens={t} icon="back" size={36} label={tr('weekly.prevWeek')} disabled={!p.canPrev} onPress={p.onPrev} />
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={kt('semibold', 15, t.text, 1.6)}>{ltr(rangeLabel(p.weekStart))}</Text>
            {p.live ? (
              <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 7, backgroundColor: t.accentChip }}>
                <Text style={kt('bold', 10.5, t.accentText, 1.6)}>{tr('weekly.liveEndsIn', { time: closesInLabel(p.weekStart) })}</Text>
              </View>
            ) : (
              <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 7, borderWidth: 1, borderColor: t.borderStrong }}>
                <Text style={kt('bold', 10.5, t.textMuted, 1.6)}>{tr('weekly.endedFinal')}</Text>
              </View>
            )}
          </View>
          <SquareButton tokens={t} icon="forward" size={36} label={tr('weekly.nextWeek')} disabled={!p.canNext} onPress={p.onNext} />
        </View>

        {p.loading && !p.challenge ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}><LeapLogo size={40} animated /></View>
        ) : !p.challenge ? (
          <View style={{ marginTop: 18, borderRadius: 26, padding: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, alignItems: 'center', gap: 8 }}>
            <Text style={[kt('semibold', 17, t.text, 1.6), { textAlign: 'center' }]}>{tr('weekly.noChallenge')}</Text>
            <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>
              {p.live ? tr('weekly.checkBack') : tr('weekly.noChallengeWeek')}
            </Text>
          </View>
        ) : (
          <>
            <Hero tokens={t} challenge={p.challenge} group={p.group} weekStart={p.weekStart} live={p.live} standing={p.standing} />
            <Movements tokens={t} challenge={p.challenge} />
            <WeeklyBoard
              tokens={t} type={type} live={p.live} rows={p.boardRows} myId={p.myId} myName={p.myName}
              showAll={p.showAll} onToggleAll={p.onToggleAll}
              inCommunity={p.inCommunity} scope={p.scope} onScope={p.onScope} gender={p.gender} onGender={p.onGender}
            />
          </>
        )}
      </ScrollView>

      {showCta && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 106, paddingTop: 26, paddingHorizontal: 24 }}>
          <LinearGradient
            pointerEvents="none"
            colors={[`${t.bg}00`, t.bg, t.bg]}
            locations={[0, 0.38, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <KitButton
            tokens={t}
            label={ctaLabel}
            onPress={p.onStart}
            fontSize={16}
            style={{ shadowColor: t.accent, shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 6 }}
          />
        </View>
      )}
    </View>
  );
}

