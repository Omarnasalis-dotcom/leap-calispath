import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { ConceptMetadata } from '../../lib/BlockConceptParser';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface BlockConfigWizardProps {
  initialMetadata: ConceptMetadata;
  onChange: (metadata: ConceptMetadata) => void;
}

export function BlockConfigWizard({ initialMetadata, onChange }: BlockConfigWizardProps) {
  const { theme, mode } = useTheme();
  
  // Normalize legacy data if present
  const [timingSystem, setTimingSystem] = useState<'amrap' | 'fortime' | 'straight_set'>(
    initialMetadata.timing_system || 
    (initialMetadata.type === 'amrap' || initialMetadata.type === 'fortime' ? initialMetadata.type : 'straight_set')
  );
  
  const [structure, setStructure] = useState<'single' | 'superset' | 'circuit' | 'ladder'>(
    initialMetadata.structure || 
    (initialMetadata.type && initialMetadata.type !== 'amrap' && initialMetadata.type !== 'fortime' ? initialMetadata.type as any : 'single')
  );

  const [timeCap, setTimeCap] = useState(String(initialMetadata.time_cap_min || initialMetadata.timer_seconds || '10'));
  const [rounds, setRounds] = useState(String(initialMetadata.rounds || '4'));
  const [ladderStart, setLadderStart] = useState(String(initialMetadata.ladder_start || '20'));
  const [ladderSub, setLadderSub] = useState(String(initialMetadata.ladder_sub || '2'));
  const [isWeighted, setIsWeighted] = useState(!!initialMetadata.is_weighted);
  const [isTierTrial, setIsTierTrial] = useState(!!initialMetadata.is_tier_trial);

  useEffect(() => {
    // Compile into ConceptMetadata
    const payload: ConceptMetadata = {
      timing_system: timingSystem,
      structure: structure,
    };

    if (timingSystem === 'amrap' || timingSystem === 'fortime') {
      payload.time_cap_min = timeCap;
    }

    if (structure === 'ladder') {
      payload.rounds = rounds;
      payload.ladder_start = ladderStart;
      payload.ladder_sub = ladderSub;
    } else if (structure !== 'single') {
      payload.rounds = rounds;
    }

    if (timingSystem === 'straight_set') {
      payload.is_weighted = isWeighted;
    }

    if (isTierTrial) {
      payload.is_tier_trial = true;
    }

    onChange(payload);
  }, [timingSystem, structure, timeCap, rounds, ladderStart, ladderSub, isWeighted, isTierTrial]);

  const TimingOption = ({ value, label }: { value: any, label: string }) => {
    const active = timingSystem === value;
    return (
      <TouchableOpacity 
        style={[styles.optionBtn, { borderColor: active ? theme.accent : theme.card.border, backgroundColor: active ? 'rgba(255, 82, 82, 0.1)' : 'transparent' }]}
        onPress={() => setTimingSystem(value)}
      >
        <Text style={[styles.optionText, { color: active ? theme.accent : theme.text.secondary }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const StructureOption = ({ value, label }: { value: any, label: string }) => {
    const active = structure === value;
    return (
      <TouchableOpacity 
        style={[styles.optionBtn, { borderColor: active ? '#7E57C2' : theme.card.border, backgroundColor: active ? 'rgba(126, 87, 194, 0.1)' : 'transparent' }]}
        onPress={() => setStructure(value)}
      >
        <Text style={[styles.optionText, { color: active ? '#7E57C2' : theme.text.secondary }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>1. TIMING SYSTEM</Text>
      <View style={styles.row}>
        <TimingOption value="straight_set" label="STRAIGHT SET" />
        <TimingOption value="amrap" label="AMRAP" />
        <TimingOption value="fortime" label="FOR TIME" />
      </View>

      {(timingSystem === 'amrap' || timingSystem === 'fortime') && (
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>TIME CAP (MINUTES)</Text>
          <TextInput
            style={[styles.input, { color: theme.text.primary, borderColor: theme.card.border, backgroundColor: mode === 'dark' ? '#111' : '#F5F5F5' }]}
            keyboardType="number-pad"
            value={timeCap}
            onChangeText={setTimeCap}
          />
        </View>
      )}

      {timingSystem === 'straight_set' && (
        <TouchableOpacity 
          style={styles.checkboxRow}
          onPress={() => setIsWeighted(!isWeighted)}
        >
          <MaterialCommunityIcons name={isWeighted ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={isWeighted ? theme.accent : theme.text.tertiary} />
          <Text style={[styles.checkboxLabel, { color: theme.text.primary }]}>IS THIS A WEIGHTED BLOCK?</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.sectionTitle, { color: theme.text.primary, marginTop: 24 }]}>2. STRUCTURE</Text>
      <View style={styles.row}>
        <StructureOption value="single" label="SINGLE" />
        <StructureOption value="superset" label="SUPERSET" />
        <StructureOption value="circuit" label="CIRCUIT" />
        <StructureOption value="ladder" label="LADDER" />
      </View>

      {structure !== 'single' && (
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>NUMBER OF ROUNDS / SETS</Text>
          <TextInput
            style={[styles.input, { color: theme.text.primary, borderColor: theme.card.border, backgroundColor: mode === 'dark' ? '#111' : '#F5F5F5' }]}
            keyboardType="number-pad"
            value={rounds}
            onChangeText={setRounds}
          />
        </View>
      )}

      {structure === 'ladder' && (
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>STARTING REPS</Text>
            <TextInput
              style={[styles.input, { color: theme.text.primary, borderColor: theme.card.border, backgroundColor: mode === 'dark' ? '#111' : '#F5F5F5' }]}
              keyboardType="number-pad"
              value={ladderStart}
              onChangeText={setLadderStart}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>DROP PER ROUND (-)</Text>
            <TextInput
              style={[styles.input, { color: theme.text.primary, borderColor: theme.card.border, backgroundColor: mode === 'dark' ? '#111' : '#F5F5F5' }]}
              keyboardType="number-pad"
              value={ladderSub}
              onChangeText={setLadderSub}
            />
          </View>
        </View>
      )}

      {structure === 'ladder' && rounds && ladderStart && (
        <View style={{ marginTop: 12, padding: 12, backgroundColor: 'rgba(126, 87, 194, 0.1)', borderRadius: 8 }}>
          <Text style={{ color: '#7E57C2', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1 }}>
            PREVIEW: {rounds} ROUNDS OF {
              Array.from({ length: parseInt(rounds) || 0 }).map((_, i) => Math.max(0, parseInt(ladderStart) - (parseInt(ladderSub || '0') * i))).join(', ')
            } REPS
          </Text>
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: theme.text.primary, marginTop: 24 }]}>3. SPECIAL ROUTING</Text>
      <TouchableOpacity 
        style={styles.checkboxRow}
        onPress={() => setIsTierTrial(!isTierTrial)}
      >
        <MaterialCommunityIcons name={isTierTrial ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={isTierTrial ? theme.accent : theme.text.tertiary} />
        <Text style={[styles.checkboxLabel, { color: theme.text.primary }]}>SET AS STRENGTH TIER TRIAL ROUTE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  sectionTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 16,
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  optionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    flexGrow: 1,
    alignItems: 'center',
  },
  optionText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  checkboxLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
  }
});
