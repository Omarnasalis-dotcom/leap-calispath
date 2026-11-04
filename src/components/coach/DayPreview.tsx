// The day card's "See exercises" list (2026-11-04, owner): every block and
// its exercises before the athlete adds the day. The server sends raw
// numbers (supabase/functions/ai-coach/tools/dayPreview.ts); this words them
// in the athlete's language.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CoachPalette } from './coachTokens';
import { t } from '../../i18n';

export interface PreviewExercise {
  name: string;
  sets: number | null;
  reps: number | null;
  hold_seconds: number | null;
  is_weighted: boolean;
  // The exercise's own note, e.g. "On rings". Absent from older servers.
  note?: string | null;
}

export interface PreviewBlock {
  title: string;
  structure: string | null;
  rounds: number | null;
  exercises: PreviewExercise[];
}

// In a circuit or superset the rounds repeat the whole group, so each
// exercise shows its own reps or hold without a sets count.
export function previewDose(ex: PreviewExercise, grouped: boolean): string {
  const sets = !grouped && ex.sets && ex.sets > 1 ? ex.sets : null;
  let dose = '';
  if (ex.hold_seconds) {
    dose = sets ? t('coach.previewSetsHold', { sets, seconds: ex.hold_seconds }) : t('coach.previewHold', { seconds: ex.hold_seconds });
  } else if (ex.reps) {
    dose = sets ? t('coach.previewSetsReps', { sets, reps: ex.reps }) : t('coach.previewReps', { count: ex.reps });
  }
  return ex.is_weighted ? `${dose}${t('coach.previewWeighted')}` : dose;
}

export function isGrouped(block: PreviewBlock): boolean {
  return block.structure === 'circuit' || block.structure === 'superset';
}

export function DayPreviewList({ blocks, colors }: { blocks: PreviewBlock[]; colors: CoachPalette }) {
  return (
    <View style={[styles.list, { borderTopColor: colors.cardBorder }]}>
      {blocks.map((block, i) => {
        const grouped = isGrouped(block);
        return (
          <View key={`${block.title}-${i}`} style={styles.block}>
            <View style={styles.blockHeader}>
              <Text style={[styles.blockTitle, { color: colors.bodyText }]}>{block.title.toUpperCase()}</Text>
              {grouped && block.rounds && block.rounds > 1 ? (
                <Text style={[styles.rounds, { color: colors.dimMeta }]}>{t('coach.previewRounds', { count: block.rounds })}</Text>
              ) : null}
            </View>
            {block.exercises.map((ex, j) => (
              <View key={`${ex.name}-${j}`}>
                <View style={styles.row}>
                  <Text style={[styles.name, { color: colors.secondaryText }]} numberOfLines={2}>{ex.name}</Text>
                  <Text style={[styles.dose, { color: colors.secondaryText }]}>{previewDose(ex, grouped)}</Text>
                </View>
                {ex.note ? <Text style={[styles.note, { color: colors.dimMeta }]} numberOfLines={2}>{ex.note}</Text> : null}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 10,
  },
  block: {
    gap: 3,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  rounds: {
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  dose: {
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  note: {
    fontSize: 11,
    lineHeight: 15,
  },
});
