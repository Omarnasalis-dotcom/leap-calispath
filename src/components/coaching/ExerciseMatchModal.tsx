import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { ExerciseChoice, ImportBlockPreview, UnmatchedExercise } from '../../lib/ProgramImportParser';
import type { LibraryExerciseName } from '../../lib/exerciseNameMatch';
import { InlineVideoPlayer } from './InlineVideoPlayer';

const bronzeGold = '#C8A040';

// Same YouTube id check InlineVideoPlayer uses: ▶ only for links it can play.
const playable = (url?: string | null) =>
  !!url && /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]{11}).*/.test(url);
const CREATE = '__create__';
const REMOVE = '__remove__';

interface Props {
  items: UnmatchedExercise[] | null;
  onConfirm: (choices: ExerciseChoice[]) => void;
  onCancel: () => void;
}

/** Import step for exercise names the library doesn't have. For each one the
 * coach can open the full block(s) it sits in, then use a close library
 * exercise, add the name as new, or remove it from the block. Opened by
 * useExerciseMatchPrompt; nothing is imported until they confirm. */
export function ExerciseMatchModal({ items, onConfirm, onCancel }: Props) {
  const { theme, mode } = useTheme();
  const solidBg = mode === 'dark' ? '#151515' : '#FFFFFF';
  const panelBg = mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)';
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The suggestion whose demo video is playing, per unmatched name.
  const [playing, setPlaying] = useState<Record<string, LibraryExerciseName | null>>({});

  // Names with no close match start on "Add as new"; the rest wait for a pick,
  // so a quick tap-through never swaps in an exercise the coach didn't see.
  useEffect(() => {
    if (!items) return;
    const initial: Record<string, string> = {};
    for (const item of items) if (item.suggestions.length === 0) initial[item.name] = CREATE;
    setPicks(initial);
    setOpen({});
    setPlaying({});
  }, [items]);

  if (!items) return null;
  const allPicked = items.every((item) => picks[item.name]);

  const confirm = () => {
    onConfirm(
      items.map((item) => {
        const pick = picks[item.name];
        if (pick === CREATE) return { name: item.name, create: true as const };
        if (pick === REMOVE) return { name: item.name, remove: true as const };
        return { name: item.name, exerciseId: pick };
      })
    );
  };

  const option = (itemName: string, value: string, label: string) => {
    const selected = picks[itemName] === value;
    return (
      <TouchableOpacity
        key={value}
        onPress={() => setPicks((p) => ({ ...p, [itemName]: value }))}
        style={[
          styles.option,
          { borderColor: selected ? bronzeGold : theme.card.borderStrong, backgroundColor: selected ? 'rgba(200,160,64,0.14)' : 'transparent' },
        ]}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
      >
        <Text style={[styles.optionText, { color: selected ? bronzeGold : theme.text.primary }]} numberOfLines={2}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // A suggestion: tap the name to pick it, tap ▶ to watch its demo first.
  const suggestion = (itemName: string, s: LibraryExerciseName) => {
    const selected = picks[itemName] === s.id;
    const isPlaying = playing[itemName]?.id === s.id;
    return (
      <View
        key={s.id}
        style={[
          styles.option,
          styles.suggestion,
          { borderColor: selected ? bronzeGold : theme.card.borderStrong, backgroundColor: selected ? 'rgba(200,160,64,0.14)' : 'transparent' },
        ]}
      >
        <TouchableOpacity
          onPress={() => setPicks((p) => ({ ...p, [itemName]: s.id }))}
          accessibilityRole="radio"
          accessibilityState={{ selected }}
          style={{ flexShrink: 1 }}
        >
          <Text style={[styles.optionText, { color: selected ? bronzeGold : theme.text.primary }]} numberOfLines={2}>
            {s.name}
          </Text>
        </TouchableOpacity>
        {playable(s.youtube_url) && (
          <TouchableOpacity
            onPress={() => setPlaying((p) => ({ ...p, [itemName]: isPlaying ? null : s }))}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? `Close ${s.name} video` : `Watch ${s.name} video`}
            hitSlop={8}
            style={[styles.play, { borderColor: theme.card.borderStrong }]}
          >
            <Text style={[styles.playText, { color: isPlaying ? bronzeGold : theme.text.secondary }]}>{isPlaying ? '■' : '▶'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const blockPreview = (block: ImportBlockPreview, key: string) => (
    <View key={key} style={[styles.preview, { backgroundColor: panelBg, borderColor: theme.card.border }]}>
      <View style={styles.previewHead}>
        <Text style={[styles.previewTitle, { color: theme.text.primary }]} numberOfLines={2}>{block.label}</Text>
        <Text style={[styles.previewKind, { color: theme.text.secondary }]}>{block.kind}</Text>
      </View>
      {block.exercises.map((ex, i) => (
        <View key={i} style={styles.previewRow}>
          <Text
            style={[
              styles.previewName,
              { color: ex.isThis ? bronzeGold : theme.text.primary, fontWeight: ex.isThis ? '800' : '500' },
            ]}
          >
            {i + 1}. {ex.name}
            {ex.isThis ? '  ← this one' : ex.alsoUnmatched ? '  (also not in library)' : ''}
          </Text>
          {!!ex.detail && <Text style={[styles.previewDetail, { color: theme.text.tertiary }]}>{ex.detail}</Text>}
        </View>
      ))}
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: solidBg, borderColor: theme.card.border }]}>
          <Text style={[styles.title, { color: theme.text.primary }]}>CHECK EXERCISES</Text>
          <Text style={[styles.intro, { color: theme.text.secondary }]}>
            {items.length === 1 ? '1 exercise in this file is' : `${items.length} exercises in this file are`} not in the
            library. Pick the right one, add it as a new exercise, or remove it from the block.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 4 }}>
            {items.map((item) => {
              const isOpen = !!open[item.name];
              const blockCount = item.blocks.length;
              return (
                <View key={item.name} style={[styles.row, { borderColor: theme.card.border }]}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: theme.text.primary }]}>{item.name}</Text>
                    {blockCount > 0 && (
                      <TouchableOpacity
                        onPress={() => setOpen((o) => ({ ...o, [item.name]: !isOpen }))}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        hitSlop={8}
                      >
                        <Text style={[styles.viewLink, { color: bronzeGold }]}>
                          {isOpen ? 'Hide block' : blockCount === 1 ? 'View block' : `View ${blockCount} blocks`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {isOpen && item.blocks.map((b, i) => blockPreview(b, `${item.name}-${i}`))}
                  <Text style={[styles.hint, { color: theme.text.tertiary }]}>
                    {item.suggestions.length > 0 ? 'Did you mean:' : 'No close match in the library.'}
                  </Text>
                  <View style={styles.options}>
                    {item.suggestions.map((s) => suggestion(item.name, s))}
                    {option(item.name, CREATE, '+ Add as new')}
                    {option(item.name, REMOVE, blockCount > 1 ? `Remove from ${blockCount} blocks` : 'Remove from block')}
                  </View>
                  {!!playing[item.name]?.youtube_url && (
                    <View style={styles.video}>
                      <Text style={[styles.videoCaption, { color: theme.text.secondary }]}>{playing[item.name]!.name}</Text>
                      <InlineVideoPlayer
                        key={playing[item.name]!.id}
                        url={playing[item.name]!.youtube_url!}
                        theme={theme}
                        onClose={() => setPlaying((p) => ({ ...p, [item.name]: null }))}
                      />
                    </View>
                  )}
                  {picks[item.name] === REMOVE && item.emptiesBlocks > 0 && (
                    <Text style={[styles.warn, { color: theme.danger }]}>
                      {item.emptiesBlocks === 1
                        ? 'This leaves 1 block with no exercises.'
                        : `This leaves ${item.emptiesBlocks} blocks with no exercises.`}
                    </Text>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Text style={[styles.note, { color: theme.text.tertiary }]}>
            New exercises are added without a category or video. Finish them in the Exercise Library.
          </Text>

          <View style={styles.footer}>
            <TouchableOpacity onPress={onCancel} style={[styles.button, { borderColor: theme.card.borderStrong }]}>
              <Text style={[styles.buttonText, { color: theme.text.primary }]}>CANCEL IMPORT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirm}
              disabled={!allPicked}
              style={[styles.button, { borderColor: bronzeGold, backgroundColor: bronzeGold, opacity: allPicked ? 1 : 0.4 }]}
            >
              <Text style={[styles.buttonText, { color: '#000' }]}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 16, borderWidth: 1, padding: 20, maxHeight: '88%', width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  list: { flexGrow: 0 },
  row: { borderTopWidth: 1, paddingVertical: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  viewLink: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: 6, marginBottom: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, maxWidth: '100%' },
  optionText: { fontSize: 13, fontWeight: '600' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 6 },
  play: { borderWidth: 1, borderRadius: 999, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  playText: { fontSize: 10, fontWeight: '800' },
  video: { marginTop: 10, gap: 6 },
  videoCaption: { fontSize: 12, fontWeight: '700' },
  warn: { fontSize: 12, marginTop: 8 },
  preview: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 },
  previewHead: { marginBottom: 6 },
  previewTitle: { fontSize: 13, fontWeight: '700' },
  previewKind: { fontSize: 12, marginTop: 1 },
  previewRow: { paddingVertical: 3 },
  previewName: { fontSize: 13 },
  previewDetail: { fontSize: 12, marginTop: 1 },
  note: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 14 },
  button: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },
});
