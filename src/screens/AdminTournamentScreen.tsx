import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, FlatList
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { TournamentService } from '../services/TournamentService';

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

export function AdminTournamentScreen({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'knockout' | 'rank_based'>('knockout');
  const [bracketSize, setBracketSize] = useState<2 | 4 | 8>(4);
  const [gpPool, setGpPool] = useState('100');
  const [minParticipants, setMinParticipants] = useState('4');

  // Knockout specific
  const [rounds, setRounds] = useState<RoundConfig[]>([]);
  const [roundWindow, setRoundWindow] = useState('60'); // minutes

  // Rank based specific
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

  const [existingTournaments, setExistingTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const isPublishing = useRef(false);

  useEffect(() => {
    fetchTournaments();
  }, []);

  useEffect(() => {
    if (type === 'knockout') {
      const count = Math.log2(bracketSize);
      const titles = ROUND_TITLES[count] || [];
      const newRounds: RoundConfig[] = titles.map((t, i) => ({
        day: i + 1,
        title: t,
        mode: 'amrap',
        duration_min: 0,
        strategy: 'best',
        trials: 1,
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
    if (parseInt(gpPool) <= 0) throw new Error('GP must be a positive number');

    if (type === 'knockout') {
      if (rounds.some(r => r.exercises.length === 0)) throw new Error('Each round must have at least one exercise');
      if (rounds.some(r => r.exercises.some(ex => ex.target_reps === 0))) throw new Error('Each exercise must have at least 1 rep');
      if (rounds.some(r => r.mode === 'amrap' && r.duration_min <= 0)) throw new Error('AMRAP rounds must have a duration');
      if (parseInt(roundWindow) <= 0) throw new Error('Window time must be > 0');
    } else {
      if (rankWorkout.exercises.length === 0) throw new Error('Workout must have at least one exercise');
      if (rankWorkout.exercises.some(ex => ex.target_reps === 0)) throw new Error('Each exercise must have at least 1 rep');
      if (rankWorkout.mode === 'amrap' && rankWorkout.duration_min <= 0) throw new Error('AMRAP workouts must have a duration');
      if (parseInt(windowHours) <= 0) throw new Error('Window time must be > 0');
    }

    const active = await TournamentService.getActiveSession();
    if (active) throw new Error('An active tournament session already exists');
  };

  const handlePublish = async () => {
    if (isPublishing.current) return;
    isPublishing.current = true;
    setLoading(true);

    try {
      await validate();

      const workout_config = type === 'knockout'
        ? rounds.map(r => r.mode === 'for_time' ? { ...r, duration_min: 0 } : r)
        : [{ 
            ...rankWorkout, 
            duration_min: rankWorkout.mode === 'amrap' ? rankWorkout.duration_min : 0,
            max_seconds: rankWorkout.mode === 'for_time' ? parseInt(maxSeconds) : undefined,
            exercises: rankWorkout.exercises.length > 0 ? rankWorkout.exercises : [{ name: 'Push-ups', target_reps: 1, target_rounds: 1, weight_kg: 0 }]
          }];

      const window_time_min = type === 'knockout' ? parseInt(roundWindow) : parseInt(windowHours) * 60;

      console.log('PUBLISHING config:', JSON.stringify({ title, type, workout_config, window_time_min }));

      const { data: config, error: configErr } = await supabase
        .from('tournament_configs')
        .insert({
          title,
          type,
          bracket_size: type === 'knockout' ? bracketSize : null,
          workout_config,
          window_time_min,
          max_trials: type === 'rank_based' ? parseInt(maxTrials) : null,
          cooldown_min: type === 'rank_based' ? parseInt(cooldown) : null,
          min_participants: parseInt(minParticipants),
          payout_gp: parseInt(gpPool)
        })
        .select()
        .single();

      if (configErr) throw configErr;

      const { error: sessionErr } = await supabase
        .from('tournament_sessions')
        .insert({
          config_id: config.id,
          status: 'registration',
          current_round: 0,
        });

      if (sessionErr) throw sessionErr;

      Alert.alert('Success', 'Tournament Published!');
      onClose();
    } catch (err: any) {
      Alert.alert('Validation Error', err.message);
    } finally {
      setLoading(false);
      isPublishing.current = false;
    }
  };

  const handleDelete = async (sessionId: string, status: string) => {
    if (status !== 'registration') {
      Alert.alert('Error', 'Only tournaments in registration status can be deleted');
      return;
    }

    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Are you sure you want to delete this tournament?')
      : await new Promise(resolve => Alert.alert('Confirm Delete', 'Are you sure?', [
        { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
        { text: 'Delete', onPress: () => resolve(true), style: 'destructive' }
      ]));

    if (!confirmed) return;

    try {
      const { data: session } = await supabase
        .from('tournament_sessions')
        .select('config_id')
        .eq('id', sessionId)
        .single();

      await supabase.from('tournament_matches').delete().eq('tournament_id', sessionId);
      await supabase.from('tournament_participants').delete().eq('tournament_id', sessionId);
      await supabase.from('tournament_sessions').delete().eq('id', sessionId);
      if (session?.config_id) {
        await supabase.from('tournament_configs').delete().eq('id', session.config_id);
      }

      Alert.alert('Deleted', 'Tournament removed successfully');
      fetchTournaments();
    } catch (err: any) {
      Alert.alert('Delete Failed', err.message);
    }
  };

  const updateRound = (index: number, updates: Partial<RoundConfig>) => {
    const newRounds = [...rounds];
    newRounds[index] = { ...newRounds[index], ...updates };
    setRounds(newRounds);
  };

  const updateExercise = (roundIndex: number, exIndex: number, updates: Partial<ExerciseConfig>) => {
    const newRounds = [...rounds];
    const newEx = [...newRounds[roundIndex].exercises];
    newEx[exIndex] = { ...newEx[exIndex], ...updates };
    newRounds[roundIndex].exercises = newEx;
    setRounds(newRounds);
  };

  const renderKnockoutConfig = () => (
    <View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>BRACKET SIZE</Text>
          <View style={styles.tabRow}>
            {[2, 4, 8].map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setBracketSize(s as any)}
                style={[styles.tabBtn, { borderColor: bracketSize === s ? theme.accent : 'transparent', backgroundColor: theme.card.background }]}
              >
                <Text style={{ color: bracketSize === s ? theme.accent : theme.text.secondary }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>WINDOW (MIN/ROUND)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]}
            value={roundWindow}
            onChangeText={setRoundWindow}
            keyboardType="numeric"
          />
        </View>
      </View>

      {rounds.map((r, i) => (
        <View key={i} style={[styles.roundCard, { backgroundColor: theme.card.background }]}>
          <Text style={[styles.roundTitle, { color: theme.accent }]}>{r.title}</Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => updateRound(i, { mode: r.mode === 'amrap' ? 'for_time' : 'amrap' })}
              style={[styles.smallBtn, { backgroundColor: 'rgba(255,255,255,0.05)' }]}
            >
              <Text style={{ color: theme.text.primary, fontSize: 10 }}>{r.mode.toUpperCase()}</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.smallInput, { color: theme.text.primary }]}
              placeholder="Min"
              placeholderTextColor={theme.text.tertiary}
              value={r.duration_min.toString()}
              onChangeText={val => updateRound(i, { duration_min: parseInt(val) || 0 })}
              keyboardType="numeric"
            />
          </View>
          {r.exercises.map((ex, exIdx) => (
            <View key={exIdx} style={styles.exRow}>
              <View style={{ flex: 1 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {AVAILABLE_EXERCISES.map(name => (
                    <TouchableOpacity
                      key={name}
                      onPress={() => updateExercise(i, exIdx, { name })}
                      style={[styles.exChip, { backgroundColor: ex.name === name ? theme.accent : 'rgba(255,255,255,0.1)' }]}
                    >
                      <Text style={{ fontSize: 9, color: ex.name === name ? '#000' : theme.text.secondary }}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TextInput
                  style={[styles.smallInput, { width: 35 }]}
                  value={ex.target_reps.toString()}
                  onChangeText={val => updateExercise(i, exIdx, { target_reps: parseInt(val) || 0 })}
                  keyboardType="numeric"
                />
                <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>REPS</Text>
                <TextInput
                  style={[styles.smallInput, { width: 35 }]}
                  value={ex.target_rounds.toString()}
                  onChangeText={val => updateExercise(i, exIdx, { target_rounds: parseInt(val) || 0 })}
                  keyboardType="numeric"
                />
                <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>RDS</Text>
                <TextInput
                  style={[styles.smallInput, { width: 35 }]}
                  value={ex.weight_kg.toString()}
                  onChangeText={val => updateExercise(i, exIdx, { weight_kg: parseInt(val) || 0 })}
                  keyboardType="numeric"
                />
                <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>KG</Text>
                <TouchableOpacity onPress={() => {
                  const newRounds = [...rounds];
                  newRounds[i].exercises = newRounds[i].exercises.filter((_, idx) => idx !== exIdx);
                  setRounds(newRounds);
                }}>
                  <MaterialCommunityIcons name="close" size={16} color={'#EF4444'} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity
            onPress={() => {
              const newRounds = [...rounds];
              newRounds[i].exercises.push({ name: 'Push-ups', target_reps: 0, target_rounds: 0, weight_kg: 0 });
              setRounds(newRounds);
            }}
            style={{ marginTop: 12, padding: 8, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
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
          <TextInput
            style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]}
            value={windowHours}
            onChangeText={setWindowHours}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>MIN PARTICIPANTS</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]}
            value={minParticipants}
            onChangeText={setMinParticipants}
            keyboardType="numeric"
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>MAX TRIALS</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]}
            value={maxTrials}
            onChangeText={setMaxTrials}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>COOLDOWN (MIN)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]}
            value={cooldown}
            onChangeText={setCooldown}
            keyboardType="numeric"
          />
        </View>
      </View>
      <View style={styles.row}>
        {rankWorkout.mode === 'for_time' ? (
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.text.tertiary }]}>MAX SECS/TRIAL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]}
              value={maxSeconds}
              onChangeText={setMaxSeconds}
              keyboardType="numeric"
            />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.text.tertiary }]}>DURATION (MIN)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]}
              value={rankWorkout.duration_min.toString()}
              onChangeText={val => setRankWorkout({ ...rankWorkout, duration_min: parseInt(val) || 0 })}
              keyboardType="numeric"
            />
          </View>
        )}
        <View style={{ flex: 1 }} />
      </View>

      <View style={[styles.roundCard, { backgroundColor: theme.card.background }]}>
        <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
          <Text style={[styles.roundTitle, { color: theme.accent, marginBottom: 0 }]}>WORKOUT CONFIG</Text>
          <TouchableOpacity
            onPress={() => setRankWorkout({ ...rankWorkout, mode: rankWorkout.mode === 'amrap' ? 'for_time' : 'amrap' })}
            style={[styles.smallBtn, { backgroundColor: 'rgba(255,255,255,0.05)' }]}
          >
            <Text style={{ color: theme.text.primary, fontSize: 10 }}>{rankWorkout.mode.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
        {rankWorkout.exercises.map((ex, exIdx) => (
          <View key={exIdx} style={styles.exRow}>
            <View style={{ flex: 1 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {AVAILABLE_EXERCISES.map(name => (
                  <TouchableOpacity
                    key={name}
                    onPress={() => {
                      const newEx = [...rankWorkout.exercises];
                      newEx[exIdx] = { ...newEx[exIdx], name };
                      setRankWorkout({ ...rankWorkout, exercises: newEx });
                    }}
                    style={[styles.exChip, { backgroundColor: ex.name === name ? theme.accent : 'rgba(255,255,255,0.1)' }]}
                  >
                    <Text style={{ fontSize: 9, color: ex.name === name ? '#000' : theme.text.secondary }}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TextInput
                style={[styles.smallInput, { width: 35 }]}
                value={ex.target_reps.toString()}
                onChangeText={val => {
                  const newEx = [...rankWorkout.exercises];
                  newEx[exIdx] = { ...newEx[exIdx], target_reps: parseInt(val) || 0 };
                  setRankWorkout({ ...rankWorkout, exercises: newEx });
                }}
                keyboardType="numeric"
              />
              <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>REPS</Text>
              <TextInput
                style={[styles.smallInput, { width: 35 }]}
                value={ex.target_rounds.toString()}
                onChangeText={val => {
                  const newEx = [...rankWorkout.exercises];
                  newEx[exIdx] = { ...newEx[exIdx], target_rounds: parseInt(val) || 0 };
                  setRankWorkout({ ...rankWorkout, exercises: newEx });
                }}
                keyboardType="numeric"
              />
              <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>RDS</Text>
              <TextInput
                style={[styles.smallInput, { width: 35 }]}
                value={ex.weight_kg.toString()}
                onChangeText={val => {
                  const newEx = [...rankWorkout.exercises];
                  newEx[exIdx] = { ...newEx[exIdx], weight_kg: parseInt(val) || 0 };
                  setRankWorkout({ ...rankWorkout, exercises: newEx });
                }}
                keyboardType="numeric"
              />
              <Text style={{ color: theme.text.tertiary, fontSize: 8 }}>KG</Text>
              <TouchableOpacity onPress={() => {
                const newEx = rankWorkout.exercises.filter((_, idx) => idx !== exIdx);
                setRankWorkout({ ...rankWorkout, exercises: newEx });
              }}>
                <MaterialCommunityIcons name="close" size={16} color={'#EF4444'} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <TouchableOpacity
          onPress={() => {
            setRankWorkout({
              ...rankWorkout,
              exercises: [...rankWorkout.exercises, { name: 'Push-ups', target_reps: 0, target_rounds: 0, weight_kg: 0 }]
            });
          }}
          style={{ marginTop: 12, padding: 8, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}
        >
          <Text style={{ color: theme.accent, fontSize: 10, fontWeight: 'bold' }}>+ ADD EXERCISE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text.primary }]}>TOURNAMENT COMMAND</Text>
        <TouchableOpacity onPress={onClose}>
          <MaterialCommunityIcons name="close" size={24} color={theme.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>TOURNAMENT TITLE</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]}
            placeholder="E.g. Summer Slam"
            placeholderTextColor={theme.text.tertiary}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>PRIZE POOL (GP)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card.background, color: theme.text.primary }]}
            placeholder="100"
            placeholderTextColor={theme.text.tertiary}
            value={gpPool}
            onChangeText={setGpPool}
            keyboardType="numeric"
          />
          <Text style={{ color: theme.text.tertiary, fontSize: 10, marginTop: 4 }}>
            Split: 1st - {Math.floor(parseInt(gpPool || '0') * 0.75)} GP | 2nd - {Math.floor(parseInt(gpPool || '0') * 0.25)} GP
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text.tertiary }]}>TOURNAMENT TYPE</Text>
          <View style={styles.tabRow}>
            <TouchableOpacity
              onPress={() => setType('knockout')}
              style={[styles.typeBtn, { borderColor: type === 'knockout' ? theme.accent : 'transparent', backgroundColor: theme.card.background }]}
            >
              <Text style={{ color: type === 'knockout' ? theme.accent : theme.text.secondary }}>KNOCKOUT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setType('rank_based')}
              style={[styles.typeBtn, { borderColor: type === 'rank_based' ? theme.accent : 'transparent', backgroundColor: theme.card.background }]}
            >
              <Text style={{ color: type === 'rank_based' ? theme.accent : theme.text.secondary }}>RANK BASED</Text>
            </TouchableOpacity>
          </View>
        </View>

        {type === 'knockout' ? renderKnockoutConfig() : renderRankBasedConfig()}

        <TouchableOpacity
          style={[styles.publishBtn, { backgroundColor: theme.accent }]}
          onPress={handlePublish}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.publishBtnText}>PUBLISH TOURNAMENT</Text>}
        </TouchableOpacity>

        <View style={[styles.section, { marginTop: 40 }]}>
          <Text style={[styles.headerTitle, { color: theme.text.primary, fontSize: 16, marginBottom: 12 }]}>EXISTING TOURNAMENTS</Text>
          {existingTournaments.map(item => (
            <View key={item.id} style={[styles.historyCard, { backgroundColor: theme.card.background }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text.primary, fontWeight: 'bold' }}>{item.config?.title}</Text>
                <Text style={{ color: theme.text.tertiary, fontSize: 10 }}>{item.status.toUpperCase()} • {item.config?.type.toUpperCase()}</Text>
              </View>
              {item.status === 'registration' && (
                <TouchableOpacity onPress={() => handleDelete(item.id, item.status)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={'#EF4444'} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
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
});
