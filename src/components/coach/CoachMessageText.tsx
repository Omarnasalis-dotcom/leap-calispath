// Coach reply text, laid out for reading rather than as one wall of text:
// blank lines become paragraph gaps, "- " / "1. " lines become list rows,
// and recap lines ("Exercise (variant): what happened → what changes")
// become a bold exercise name with the change on its own line. Only the
// shape of the text is read here; nothing the coach wrote is dropped.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CoachPalette } from './coachTokens';
import { isRTL } from '../../i18n';

export type CoachLine =
  | { type: 'text'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'numbered'; n: string; text: string }
  | { type: 'recap'; label: string; result: string; change: string | null };

// Paragraphs (split on blank lines), each a list of lines.
export function parseCoachText(content: string): CoachLine[][] {
  const paragraphs: CoachLine[][] = [];
  let current: CoachLine[] = [];
  for (const raw of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      if (current.length) paragraphs.push(current);
      current = [];
      continue;
    }
    const bullet = line.match(/^[-•*]\s+(.+)$/);
    const numbered = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
    const body = bullet ? bullet[1] : numbered ? numbered[2] : line;
    // A recap needs both a short "label:" and an arrow, so ordinary
    // sentences that happen to contain a colon stay plain text.
    const recap = body.includes('→') ? body.match(/^([^:→]{2,60}):\s+(.+)$/) : null;
    if (recap) {
      const [result, ...rest] = recap[2].split('→');
      const change = rest.join('→').trim();
      current.push({ type: 'recap', label: recap[1].trim().replace(/^\*\*(.*)\*\*$/, '$1'), result: result.trim(), change: change || null });
    } else if (bullet) {
      current.push({ type: 'bullet', text: bullet[1] });
    } else if (numbered) {
      current.push({ type: 'numbered', n: numbered[1], text: numbered[2] });
    } else {
      current.push({ type: 'text', text: line });
    }
  }
  if (current.length) paragraphs.push(current);
  return paragraphs;
}

function Inline({ text, boldColor }: { text: string; boldColor: string }) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <Text key={i} style={{ fontWeight: '700', color: boldColor }}>{part.slice(2, -2)}</Text>
        ) : (
          part
        )
      )}
    </>
  );
}

export function CoachMessageText({ content, accent, colors }: { content: string; accent: string; colors: CoachPalette }) {
  const paragraphs = parseCoachText(content);
  const textStyle = [styles.text, { color: colors.bodyText }];
  return (
    <View style={styles.wrap}>
      {paragraphs.map((lines, pi) => {
        // Consecutive plain lines stay one Text so they wrap and select together.
        const groups: (CoachLine | { type: 'textRun'; lines: string[] })[] = [];
        for (const line of lines) {
          const last = groups[groups.length - 1];
          if (line.type === 'text') {
            if (last && last.type === 'textRun') last.lines.push(line.text);
            else groups.push({ type: 'textRun', lines: [line.text] });
          } else {
            groups.push(line);
          }
        }
        return (
          <View key={pi} style={styles.paragraph}>
            {groups.map((g, gi) => {
              if (g.type === 'textRun') {
                return (
                  <Text key={gi} style={textStyle}>
                    <Inline text={g.lines.join('\n')} boldColor={accent} />
                  </Text>
                );
              }
              if (g.type === 'recap') {
                return (
                  <View key={gi} style={styles.recap}>
                    <Text style={[styles.recapLabel, { color: colors.bodyText }]}>{g.label}</Text>
                    <Text style={[styles.recapResult, { color: colors.secondaryText }]}>
                      <Inline text={g.result} boldColor={colors.bodyText} />
                    </Text>
                    {g.change && (
                      <Text style={[styles.recapChange, { color: accent }]}>{isRTL ? '←' : '→'} {g.change}</Text>
                    )}
                  </View>
                );
              }
              const marker = g.type === 'numbered' ? `${g.n}.` : '•';
              return (
                <View key={gi} style={styles.listRow}>
                  <Text style={[styles.text, styles.marker, { color: accent }]}>{marker}</Text>
                  <Text style={[textStyle, styles.listText]}>
                    <Inline text={g.text} boldColor={accent} />
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  paragraph: { gap: 8 },
  // Handoff spec's fontWeight:300 read faint/blurry on real devices at this
  // size — kept at a normal weight for legibility.
  text: { fontSize: 15.5, lineHeight: 24, fontWeight: '500' },
  listRow: { flexDirection: 'row', gap: 8 },
  marker: { minWidth: 14, fontWeight: '700' },
  listText: { flex: 1 },
  recap: { gap: 2, paddingVertical: 2 },
  recapLabel: { fontSize: 15, lineHeight: 22, fontWeight: '800' },
  recapResult: { fontSize: 14.5, lineHeight: 21, fontWeight: '500' },
  recapChange: { fontSize: 14.5, lineHeight: 21, fontWeight: '600' },
});
