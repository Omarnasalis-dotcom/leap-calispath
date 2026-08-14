import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { TournamentService } from '../services/TournamentService';
import { LeapLogo } from '../components/LeapLogo';
import { useSafeMutation } from '../hooks/useSafeMutation';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';


const AVAILABLE_EXERCISES = [
  'Push-ups', 'Pull-ups', 'Dips', 'Muscle-ups', 'Squats', 'Lunges',
  'Knee Push-ups', 'Inverted Rows', 'Burpees', 'Handstand Push-ups', 'Leg Raises'
];

interface ExerciseConfig {
  name: string;
  target_reps: number;
  target_rounds: number;
  weight_kg: number;
}

interface RoundConfig {
  day: number;
  title: string;
  mode: 'amrap' | 'for_time';
  duration_min: number;
  strategy: 'best' | 'sum';
  trials: number;
  exercises: ExerciseConfig[];
}

const ROUND_TITLES: Record<number, string[]> = {
  1: ['GRAND FINALE'],
  2: ['SEMI-FINALS', 'GRAND FINALE'],
  3: ['QUARTER-FINALS', 'SEMI-FINALS', 'GRAND FINALE'],
};

type CodeType = 'trial_14' | 'member_30' | 'member_90' | 'lifetime' | 'master';

const CODE_PREFIXES: Record<CodeType, string> = {
  trial_14: 'TRIAL',
  member_30: 'LEAP',
  member_90: 'PRO',
  lifetime: 'ELITE',
  master: 'MASTER',
};

const CODE_LABELS: Record<CodeType, string> = {
  trial_14: 'Trial 14 Days',
  member_30: 'Member 30 Days',
  member_90: 'Member 90 Days',
  lifetime: 'Lifetime',
  master: 'Master Key',
};

const CODE_EXPIRY_DAYS: Record<CodeType, number | null> = {
  trial_14: 14,
  member_30: 30,
  member_90: 90,
  lifetime: null,
  master: null,
};

function generateRandomSuffix(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function CodesTab({ theme }: { theme: any }) {
  const [codeType, setCodeType] = useState<CodeType>('member_30');
  const [quantity, setQuantity] = useState('10');
  const { safeMutate: safeMutateCode, isMutating: generating } = useSafeMutation();
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [existingCodes, setExistingCodes] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loadingCodes, setLoadingCodes] = useState(false);

  useEffect(() => { fetchExistingCodes(); }, [filterStatus]);

  const fetchExistingCodes = async () => {
    setLoadingCodes(true);
    try {
      let query = supabase
        .from('invite_codes')
        .select('*, profiles:used_by(display_name)')
        .order('created_at', { ascending: false });
      if (filterStatus === 'used') query = query.not('used_by', 'is', null);
      if (filterStatus === 'unused') query = query.is('used_by', null);
      const { data } = await query;
      setExistingCodes(data || []);
    } finally {
      setLoadingCodes(false);
    }
  };

  const handleGenerate = async () => {
    const qty = Math.min(50, Math.max(1, parseInt(quantity) || 10));
    
    await safeMutateCode(async () => {
      const prefix = CODE_PREFIXES[codeType as CodeType];
      const codes = Array.from({ length: qty }, () => `${prefix}-${generateRandomSuffix()}`);
      const expiryDays = CODE_EXPIRY_DAYS[codeType as CodeType];
      const now = new Date();
      const rows = codes.map((code: string) => ({
        code,
        type: codeType,
        expires_at: expiryDays
          ? new Date(now.getTime() + expiryDays * 86400000).toISOString()
          : null,
      }));
      const { error } = await supabase.from('invite_codes').insert(rows);
      if (error) return { error };
      return { data: codes, error: null };
    }, {
      onSuccess: (codes) => {
        setGeneratedCodes(codes || []);
        fetchExistingCodes();
      }
    });
  };

  const handleRevoke = async (id: string) => {
    Alert.alert('Revoke Code', 'Delete this unused code?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive',
        onPress: async () => {
          await safeMutateCode(async () => {
            const { error } = await supabase.from('invite_codes').delete().eq('id', id);
            if (error) return { error };
            return { data: null, error: null };
          }, {
            onSuccess: () => fetchExistingCodes(),
            errorMessage: 'Failed to revoke code'
          });
        }
      }
    ]);
  };

  const copyCode = (text: string) => {
    Alert.alert('Code', text, [{ text: 'OK' }]);
  };

  const copyAll = () => {
    Alert.alert('All Generated Codes', generatedCodes.join('\n'));
  };

  const isExpired = (expiresAt: string | null) =>
    expiresAt ? new Date(expiresAt) < new Date() : false;

  return (
    <ScrollView style={{ padding: 20, paddingBottom: 100 }}>
      {/* Generate Section */}
      <View style={[styles.section, { backgroundColor: theme.card.background, padding: 16, borderRadius: 16 }]}>
        <Text style={[styles.headerTitle, { color: theme.text.primary, fontSize: 14, marginBottom: 16 }]}>GENERATE CODES</Text>

        <Text style={[styles.label, { color: theme.text.tertiary }]}>CODE TYPE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {(Object.keys(CODE_LABELS) as CodeType[]).map((t: CodeType) => (
            <TouchableOpacity
              key={t}
              onPress={() => setCodeType(t)}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                backgroundColor: codeType === t ? theme.accent : 'transparent',
                borderWidth: 1, borderColor: codeType === t ? theme.accent : theme.text.tertiary,
              }}
            >
              <Text style={{ color: codeType === t ? '#000' : theme.text.secondary, fontSize: 11, fontWeight: '700' }}>
                {CODE_LABELS[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: theme.text.tertiary }]}>QUANTITY (1–50)</Text>
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
          style={[styles.input, { backgroundColor: 'rgba(255,255,255,0.05)', color: theme.text.primary, marginBottom: 16 }]}
        />

        <TouchableOpacity
          onPress={handleGenerate}
          disabled={generating}
          style={[styles.publishBtn, { backgroundColor: theme.accent }]}
        >
          {generating
            ? <LeapLogo size={40} animated />
            : <Text style={styles.publishBtnText}>GENERATE CODES</Text>}
        </TouchableOpacity>
      </View>

      {/* Generated Codes */}
      {generatedCodes.length > 0 && (
        <View style={[styles.section, { backgroundColor: theme.card.background, padding: 16, borderRadius: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.label, { color: theme.text.tertiary }]}>{generatedCodes.length} CODES GENERATED</Text>
            <TouchableOpacity onPress={copyAll} style={{ backgroundColor: theme.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
              <Text style={{ color: '#000', fontWeight: '900', fontSize: 11 }}>COPY ALL</Text>
            </TouchableOpacity>
          </View>
          {generatedCodes.map((code: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
              <Text style={{ color: theme.text.primary, fontFamily: 'monospace', fontSize: 13 }}>{code}</Text>
              <TouchableOpacity onPress={() => copyCode(code)}>
                <MaterialCommunityIcons name="content-copy" size={16} color={theme.accent} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Existing Codes */}
      <View style={[styles.section, { backgroundColor: theme.card.background, padding: 16, borderRadius: 16 }]}>
        <Text style={[styles.headerTitle, { color: theme.text.primary, fontSize: 14, marginBottom: 12 }]}>EXISTING CODES</Text>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {['all', 'used', 'unused'].map((s: string) => (
            <TouchableOpacity key={s} onPress={() => setFilterStatus(s)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: filterStatus === s ? theme.accent : theme.text.tertiary, backgroundColor: filterStatus === s ? theme.accent : 'transparent' }}>
              <Text style={{ color: filterStatus === s ? '#000' : theme.text.secondary, fontSize: 11, fontWeight: '700' }}>{s.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={fetchExistingCodes} style={{ marginLeft: 'auto' }}>
            <MaterialCommunityIcons name="refresh" size={20} color={theme.accent} />
          </TouchableOpacity>
        </View>

        {loadingCodes
          ? <LeapLogo size={40} animated />
          : existingCodes.length === 0
            ? <Text style={{ color: theme.text.tertiary, textAlign: 'center', paddingVertical: 20 }}>No codes found</Text>
            : existingCodes.map((c: any) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text.primary, fontFamily: 'monospace', fontSize: 12, fontWeight: '700' }}>{c.code}</Text>
                  <Text style={{ color: theme.text.tertiary, fontSize: 10, marginTop: 2 }}>
                    {CODE_LABELS[c.type as CodeType] || c.type} •{' '}
                    {c.used_by
                      ? `Used by ${c.profiles?.display_name || 'unknown'}`
                      : isExpired(c.expires_at) ? '⚠️ EXPIRED' : '✓ Available'}
                  </Text>
                </View>
                {!c.used_by && (
                  <TouchableOpacity disabled={generating} onPress={() => handleRevoke(c.id)}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={generating ? "#999" : "#EF4444"} />
                  </TouchableOpacity>
                )}
              </View>
            ))
        }
      </View>
    </ScrollView>
  );
}

export function AdminTournamentScreen({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'tournaments' | 'codes'>('tournaments');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'knockout' | 'rank_based'>('knockout');
  const [bracketSize, setBracketSize] = useState<2 | 4 | 8>(4);
  const [gpPool, setGpPool] = useState('100');
  const [minParticipants, setMinParticipants] = useState('4');

  const [rounds, setRounds] = useState<RoundConfig[]>([]);
  const [roundWindow, setRoundWindow] = useState('60');

  const [rankWorkout, setRankWorkout] = useState<RoundConfig>({
    day: 1,
    title: 'RANK BATTLE',
    mode: 'amrap',
    duration_min: 0,
    strategy: 'best',
    trials: 1,
    exercises: [{ name: 'Push-ups', target_reps: 0, target_rounds: 0, weight_kg: 0 }]
  });
  const [maxTrials, setMaxTrials] = useState('10');
  const [maxSeconds, setMaxSeconds] = useState('240');
  const [cooldown, setCooldown] = useState('30');
  const [windowHours, setWindowHours] = useState('8');
  const [allowedTiers, setAllowedTiers] = useState<number[]>([0, 1, 2, 3, 4, 5, 6, 7, 8]);

  const [existingTournaments, setExistingTournaments] = useState<any[]>([]);
  const { safeMutate, isMutating: loading } = useSafeMutation();
  const isPublishing = useRef(false);

  useEffect(() => { fetchTournaments(); }, []);

  useEffect(() => {
    if (type === 'knockout') {
      const count = Math.log2(bracketSize);
      const titles = ROUND_TITLES[count] || [];
      const newRounds: RoundConfig[] = titles.map((t: string, i: number) => ({
        day: i + 1, title: t, mode: 'amrap', duration_min: 0, strategy: 'best', trials: 1,
        exercises: [{ name: 'Push-ups', target_reps: 0, target_rounds: 0, weight_kg: 0 }]
      }));
      setRounds(newRounds);
      setMinParticipants(bracketSize.toString());
    }
  }, [type, bracketSize]);

  const fetchTournaments = async () => {
    const { data } = await supabase
      .from('tournament_sessions')
      .select('*, config:tournament_configs(*)')
      .order('created_at', { ascending: false });
    setExistingTournaments(data || []);
  };

  const validate = async () => {
    if (!title.trim()) throw new Error('Title must not be empty');
    if (Number.isNaN(parseInt(gpPool)) || parseInt(gpPool) <= 0) throw new Error('GP must be a positive number');
    if (type === 'knockout') {
      if (rounds.some((r: RoundConfig) => r.exercises.length === 0)) throw new Error('Each round must have at least one exercise');
      if (rounds.some((r: RoundConfig) => r.exercises.some((ex: ExerciseConfig) => ex.target_reps === 0))) throw new Error('Each exercise must have at least 1 rep');
      if (rounds.some((r: RoundConfig) => r.mode === 'amrap' && r.duration_min <= 0)) throw new Error('AMRAP rounds must have a duration');
      if (Number.isNaN(parseInt(roundWindow)) || parseInt(roundWindow) <= 0) throw new Error('Window time must be > 0');
    } else {
      if (rankWorkout.exercises.length === 0) throw new Error('Workout must have at least one exercise');
      if (rankWorkout.exercises.some((ex: ExerciseConfig) => ex.target_reps === 0)) throw new Error('Each exercise must have at least 1 rep');
      if (rankWorkout.mode === 'amrap' && rankWorkout.duration_min <= 0) throw new Error('AMRAP workouts must have a duration');
      if (Number.isNaN(parseInt(windowHours)) || parseInt(windowHours) <= 0) throw new Error('Window time must be > 0');
    }
  };

  const handlePublish = async () => {
    if (isPublishing.current) return;
    
    await safeMutate(async () => {
      isPublishing.current = true;
      try {
        await validate();
        const workout_config = type === 'knockout'
          ? rounds.map((r: RoundConfig) => r.mode === 'for_time' ? { ...r, duration_min: 0 } : r)
          : [{ ...rankWorkout, duration_min: rankWorkout.mode === 'amrap' ? rankWorkout.duration_min : 0, max_seconds: rankWorkout.mode === 'for_time' ? parseInt(maxSeconds) : undefined, exercises: rankWorkout.exercises.length > 0 ? rankWorkout.exercises : [{ name: 'Push-ups', target_reps: 1, target_rounds: 1, weight_kg: 0 }] }];
        const window_time_min = type === 'knockout' ? parseInt(roundWindow) : parseInt(windowHours) * 60;
        const configData = { title, type, bracket_size: type === 'knockout' ? bracketSize : null, workout_config, window_time_min, max_trials: type === 'rank_based' ? parseInt(maxTrials) : null, cooldown_min: type === 'rank_based' ? parseInt(cooldown) : null, min_participants: parseInt(minParticipants), payout_gp: parseInt(gpPool), allowed_tiers: allowedTiers };
        
        const { data: config, error: configErr } = await supabase.from('tournament_configs').insert(configData).select().single();
        if (configErr) return { error: configErr };
        
        const { error: sessionErr } = await supabase.from('tournament_sessions').insert({ config_id: config.id, status: 'registration', current_round: 0 });
        if (sessionErr) return { error: sessionErr };
        
        return { data: null, error: null };
      } finally {
        isPublishing.current = false;
      }
    }, {
      onSuccess: () => {
        Alert.alert('Success', 'Tournament Published!');
        router.back();
      },
      errorMessage: 'Publishing Error'
    });
  };

  const handleDelete = async (sessionId: string, status: string) => {
    if (status !== 'registration') { Alert.alert('Error', 'Only registration tournaments can be deleted'); return; }
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this tournament?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await safeMutate(async () => {
            const { data: session } = await supabase.from('tournament_sessions').select('config_id').eq('id', sessionId).single();
            await supabase.from('tournament_matches').delete().eq('tournament_id', sessionId);
            await supabase.from('tournament_participants').delete().eq('tournament_id', sessionId);
            await supabase.from('tournament_sessions').delete().eq('id', sessionId);
            if (session?.config_id) await supabase.from('tournament_configs').delete().eq('id', session.config_id);
            return { data: null, error: null };
          }, {
            onSuccess: () => {
              Alert.alert('Deleted', 'Tournament removed successfully');
              fetchTournaments();
            },
            errorMessage: 'Delete Failed'
          });
        }},
      ]
    );
  };

  const updateRound = (index: number, updates: Partial<RoundConfig>) => {
    const newRounds = [...rounds]; newRounds[index] = { ...newRounds[index], ...updates }; setRounds(newRounds);
  };

  const updateExercise = (roundIndex: number, exIndex: number, updates: Partial<ExerciseConfig>) => {
    const newRounds = [...rounds]; const newEx = [...newRounds[roundIndex].exercises]; newEx[exIndex] = { ...newEx[exIndex], ...updates }; newRounds[roundIndex].exercises = newEx; setRounds(newRounds);
  };

  const renderKnockoutConfig = () => (
    <View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>BRACKET SIZE</Text>
          <View style={styles.tabRow}>
            {[2, 4, 8].map((s: number) => (
              <TouchableOpacity key={s} onPress={() => setBracketSize(s as any)} style={[styles.tabBtn, { borderColor: bracketSize === s ? theme.accent : 'transparent', backgroundColor: theme.card.background }]}>
                <Text style={{ color: bracketSize === s ? theme.accent : theme.text.secondary }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>WINDOW (MIN/ROUND)</Text>
          <TextInput style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]} value={roundWindow} onChangeText={setRoundWindow} keyboardType="numeric" />
        </View>
      </View>
      {rounds.map((r: RoundConfig, i: number) => (
        <View key={i} style={[styles.roundCard, { backgroundColor: theme.card.background }]}>
          <Text style={[styles.roundTitle, { color: theme.accent }]}>{r.title}</Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => updateRound(i, { mode: r.mode === 'amrap' ? 'for_time' : 'amrap' })} style={[styles.smallBtn, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
              <Text style={{ color: theme.text.primary, fontSize: 10 }}>{r.mode.toUpperCase()}</Text>
            </TouchableOpacity>
            {r.mode === 'amrap' && (
              <TextInput style={[styles.smallInput, { color: theme.text.primary }]} placeholder="Min" placeholderTextColor={theme.text.tertiary} value={r.duration_min.toString()} onChangeText={(val: string) => updateRound(i, { duration_min: parseInt(val) || 0 })} keyboardType="numeric" />
            )}
          </View>
          {r.exercises.map((ex: ExerciseConfig, exIdx: number) => (
            <View key={exIdx} style={styles.exRow}>
              <View style={{ flex: 1 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {AVAILABLE_EXERCISES.map((name: string) => (
                    <TouchableOpacity key={name} onPress={() => updateExercise(i, exIdx, { name })} style={[styles.exChip, { backgroundColor: ex.name === name ? theme.accent : 'rgba(255,255,255,0.1)' }]}>
                      <Text style={{ fontSize: 9, color: ex.name === name ? '#000' : theme.text.secondary }}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TextInput style={[styles.smallInput, { width: 35 }]} value={ex.target_reps.toString()} onChangeText={(val: string) => updateExercise(i, exIdx, { target_reps: parseInt(val) || 0 })} keyboardType="numeric" />
                <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>REPS</Text>
                <TextInput style={[styles.smallInput, { width: 35 }]} value={ex.target_rounds.toString()} onChangeText={(val: string) => updateExercise(i, exIdx, { target_rounds: parseInt(val) || 0 })} keyboardType="numeric" />
                <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>RDS</Text>
                <TextInput style={[styles.smallInput, { width: 35 }]} value={ex.weight_kg.toString()} onChangeText={(val: string) => updateExercise(i, exIdx, { weight_kg: parseInt(val) || 0 })} keyboardType="numeric" />
                <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>KG</Text>
                <TouchableOpacity onPress={() => { const newRounds = [...rounds]; newRounds[i].exercises = newRounds[i].exercises.filter((_: any, idx: number) => idx !== exIdx); setRounds(newRounds); }}>
                  <MaterialCommunityIcons name="close" size={16} color={'#EF4444'} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={() => { const newRounds = [...rounds]; newRounds[i].exercises.push({ name: 'Push-ups', target_reps: 0, target_rounds: 0, weight_kg: 0 }); setRounds(newRounds); }} style={{ marginTop: 12, padding: 8, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <Text style={{ color: theme.accent, fontSize: 10, fontWeight: 'bold' }}>+ ADD EXERCISE</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  const renderRankBasedConfig = () => (
    <View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>WINDOW (HOURS)</Text>
          <TextInput style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]} value={windowHours} onChangeText={setWindowHours} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>MIN PARTICIPANTS</Text>
          <TextInput style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]} value={minParticipants} onChangeText={setMinParticipants} keyboardType="numeric" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>MAX TRIALS</Text>
          <TextInput style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]} value={maxTrials} onChangeText={setMaxTrials} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>COOLDOWN (MIN)</Text>
          <TextInput style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]} value={cooldown} onChangeText={setCooldown} keyboardType="numeric" />
        </View>
      </View>
      <View style={styles.row}>
        {rankWorkout.mode === 'for_time' ? (
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.text.tertiary }]}>MAX SECS/TRIAL</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]} value={maxSeconds} onChangeText={setMaxSeconds} keyboardType="numeric" />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.text.tertiary }]}>DURATION (MIN)</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]} value={rankWorkout.duration_min.toString()} onChangeText={(val: string) => setRankWorkout({ ...rankWorkout, duration_min: parseInt(val) || 0 })} keyboardType="numeric" />
          </View>
        )}
        <View style={{ flex: 1 }} />
      </View>
      <View style={[styles.roundCard, { backgroundColor: theme.card.background }]}>
        <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
          <Text style={[styles.roundTitle, { color: theme.accent, marginBottom: 0 }]}>WORKOUT CONFIG</Text>
          <TouchableOpacity onPress={() => setRankWorkout({ ...rankWorkout, mode: rankWorkout.mode === 'amrap' ? 'for_time' : 'amrap' })} style={[styles.smallBtn, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
            <Text style={{ color: theme.text.primary, fontSize: 10 }}>{rankWorkout.mode.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
        {rankWorkout.exercises.map((ex: ExerciseConfig, exIdx: number) => (
          <View key={exIdx} style={styles.exRow}>
            <View style={{ flex: 1 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {AVAILABLE_EXERCISES.map((name: string) => (
                  <TouchableOpacity key={name} onPress={() => { const newEx = [...rankWorkout.exercises]; newEx[exIdx] = { ...newEx[exIdx], name }; setRankWorkout({ ...rankWorkout, exercises: newEx }); }} style={[styles.exChip, { backgroundColor: ex.name === name ? theme.accent : 'rgba(255,255,255,0.1)' }]}>
                    <Text style={{ fontSize: 9, color: ex.name === name ? '#000' : theme.text.secondary }}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TextInput style={[styles.smallInput, { width: 35 }]} value={ex.target_reps.toString()} onChangeText={(val: string) => { const newEx = [...rankWorkout.exercises]; newEx[exIdx] = { ...newEx[exIdx], target_reps: parseInt(val) || 0 }; setRankWorkout({ ...rankWorkout, exercises: newEx }); }} keyboardType="numeric" />
              <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>REPS</Text>
              <TextInput style={[styles.smallInput, { width: 35 }]} value={ex.target_rounds.toString()} onChangeText={(val: string) => { const newEx = [...rankWorkout.exercises]; newEx[exIdx] = { ...newEx[exIdx], target_rounds: parseInt(val) || 0 }; setRankWorkout({ ...rankWorkout, exercises: newEx }); }} keyboardType="numeric" />
              <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>RDS</Text>
              <TextInput style={[styles.smallInput, { width: 35 }]} value={ex.weight_kg.toString()} onChangeText={(val: string) => { const newEx = [...rankWorkout.exercises]; newEx[exIdx] = { ...newEx[exIdx], weight_kg: parseInt(val) || 0 }; setRankWorkout({ ...rankWorkout, exercises: newEx }); }} keyboardType="numeric" />
              <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>KG</Text>
              <TouchableOpacity onPress={() => { const newEx = rankWorkout.exercises.filter((_: any, idx: number) => idx !== exIdx); setRankWorkout({ ...rankWorkout, exercises: newEx }); }}>
                <MaterialCommunityIcons name="close" size={16} color={'#EF4444'} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <TouchableOpacity onPress={() => { setRankWorkout({ ...rankWorkout, exercises: [...rankWorkout.exercises, { name: 'Push-ups', target_reps: 0, target_rounds: 0, weight_kg: 0 }] }); }} style={{ marginTop: 12, padding: 8, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}>
          <Text style={{ color: theme.accent, fontSize: 10, fontWeight: 'bold' }}>+ ADD EXERCISE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <GlobalErrorBoundary>
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="chevron-left" size={32} color={theme.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text.primary }]}>TOURNAMENT COMMAND</Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={theme.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 8, gap: 12 }}>
          <TouchableOpacity
            onPress={() => setActiveTab('tournaments')}
            style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: activeTab === 'tournaments' ? theme.accent : theme.text.tertiary, alignItems: 'center' }}
          >
            <Text style={{ color: activeTab === 'tournaments' ? theme.accent : theme.text.tertiary, fontWeight: '900', fontSize: 12 }}>TOURNAMENTS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('codes')}
            style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: activeTab === 'codes' ? theme.accent : theme.text.tertiary, alignItems: 'center' }}
          >
            <Text style={{ color: activeTab === 'codes' ? theme.accent : theme.text.tertiary, fontWeight: '900', fontSize: 12 }}>CODES</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'codes' ? (
          <CodesTab theme={theme} />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.text.tertiary }]}>TOURNAMENT TITLE</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]} placeholder="E.g. Summer Slam" placeholderTextColor={theme.text.tertiary} value={title} onChangeText={setTitle} />
            </View>
            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.text.tertiary }]}>PRIZE POOL (GP)</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]} placeholder="100" placeholderTextColor={theme.text.tertiary} value={gpPool} onChangeText={setGpPool} keyboardType="numeric" />
              <Text style={{ color: theme.text.tertiary, fontSize: 10, marginTop: 4 }}>
                Split: 1st - {Math.floor(parseInt(gpPool || '0') * 0.75)} GP | 2nd - {Math.floor(parseInt(gpPool || '0') * 0.25)} GP
              </Text>
            </View>
            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.text.tertiary }]}>TOURNAMENT TYPE</Text>
              <View style={styles.tabRow}>
                <TouchableOpacity onPress={() => setType('knockout')} style={[styles.typeBtn, { borderColor: type === 'knockout' ? theme.accent : 'transparent', backgroundColor: theme.card.background }]}>
                  <Text style={{ color: type === 'knockout' ? theme.accent : theme.text.secondary }}>KNOCKOUT</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setType('rank_based')} style={[styles.typeBtn, { borderColor: type === 'rank_based' ? theme.accent : 'transparent', backgroundColor: theme.card.background }]}>
                  <Text style={{ color: type === 'rank_based' ? theme.accent : theme.text.secondary }}>RANK BASED</Text>
                </TouchableOpacity>
              </View>
            </View>
            {type === 'knockout' ? renderKnockoutConfig() : renderRankBasedConfig()}
            <View style={[styles.section, { marginTop: 20 }]}>
              <Text style={[styles.label, { color: theme.text.tertiary, marginBottom: 8 }]}>ALLOWED TIERS (RESTRICT JOIN)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((t: number) => {
                  const isSelected = allowedTiers.includes(t);
                  return (
                    <TouchableOpacity key={t} onPress={() => { if (isSelected) { if (allowedTiers.length > 1) setAllowedTiers(allowedTiers.filter((x: number) => x !== t)); } else { setAllowedTiers([...allowedTiers, t].sort()); } }} style={[styles.tierChip, { backgroundColor: isSelected ? theme.accent : 'rgba(255,255,255,0.05)', borderColor: isSelected ? theme.accent : 'rgba(255,255,255,0.1)' }]}>
                      <Text style={{ color: isSelected ? '#000' : theme.text.secondary, fontWeight: '900', fontSize: 12 }}>T{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={{ color: theme.text.tertiary, fontSize: 10, marginTop: 8 }}>
                {allowedTiers.length === 9 ? 'Open to all tiers' : `Restricted to tiers: ${allowedTiers.join(', ')}`}
              </Text>
            </View>
            <TouchableOpacity style={[styles.publishBtn, { backgroundColor: theme.accent }]} onPress={handlePublish} disabled={loading}>
              {loading ? <LeapLogo size={40} animated /> : <Text style={styles.publishBtnText}>PUBLISH TOURNAMENT</Text>}
            </TouchableOpacity>
            <View style={[styles.section, { marginTop: 40 }]}>
              <Text style={[styles.headerTitle, { color: theme.text.primary, fontSize: 16, marginBottom: 12 }]}>EXISTING TOURNAMENTS</Text>
              {existingTournaments.map((item: any) => (
                <View key={item.id} style={[styles.historyCard, { backgroundColor: theme.card.background }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text.primary, fontWeight: 'bold' }}>{item.config?.title}</Text>
                    <Text style={{ color: theme.text.tertiary, fontSize: 10 }}>{item.status.toUpperCase()} • {item.config?.type.toUpperCase()}</Text>
                  </View>
                  {item.status === 'registration' && (
                    <TouchableOpacity disabled={loading} onPress={() => handleDelete(item.id, item.status)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={20} color={loading ? '#999' : '#EF4444'} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  scroll: { padding: 20, paddingBottom: 100 },
  section: { marginBottom: 20 },
  label: { fontSize: 10, fontWeight: '900', marginBottom: 8 },
  input: { padding: 16, borderRadius: 12, fontSize: 16 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'center' },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  typeBtn: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  roundCard: { padding: 16, borderRadius: 16, marginBottom: 12 },
  roundTitle: { fontSize: 12, fontWeight: '900', marginBottom: 12 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallInput: { padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', fontSize: 12, textAlign: 'center' },
  exRow: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' },
  exChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginRight: 6 },
  publishBtn: { padding: 20, borderRadius: 16, alignItems: 'center', marginTop: 20 },
  publishBtnText: { color: '#000', fontSize: 16, fontWeight: '900' },
  historyCard: { flexDirection: 'row', padding: 16, borderRadius: 12, marginBottom: 8, alignItems: 'center' },
  tierChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, minWidth: 45, alignItems: 'center' },
});
