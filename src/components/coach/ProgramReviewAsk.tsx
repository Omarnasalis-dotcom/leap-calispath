import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { getActiveAiProgram } from '../../lib/programReview';
import { ProgramReviewSheet } from '../coaching/ProgramReviewSheet';
import { t } from '../../i18n';

/** The small button on the "program is ready" card. Shows nothing until the
 * program is found, so a failed lookup leaves the card as it was. */
export function ProgramReviewAsk({ userId, color, mutedColor }: { userId: string; color: string; mutedColor: string }) {
  const [program, setProgram] = useState<{ id: string; week: number } | null>(null);
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let live = true;
    getActiveAiProgram(userId).then(p => { if (live) setProgram(p); }).catch(() => {});
    return () => { live = false; };
  }, [userId]);

  if (!program) return null;
  if (sent) return <Text style={[styles.text, { color: mutedColor }]}>{t('programReview.inReview')}</Text>;
  return (
    <>
      <TouchableOpacity accessibilityRole="button" hitSlop={6} onPress={() => setAsking(true)}>
        <Text style={[styles.text, { color }]}>{t('programReview.ask')}</Text>
      </TouchableOpacity>
      <ProgramReviewSheet
        visible={asking}
        warriorProgramId={program.id}
        week={program.week}
        onClose={() => setAsking(false)}
        onSent={() => { setAsking(false); setSent(true); }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 12.5, fontWeight: '600', marginTop: 8 },
});
