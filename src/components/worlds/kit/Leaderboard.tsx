import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { getCountryCode } from '../../../constants/countries';
import { BoardRow, fmt2, initials } from '../../../lib/worldStanding';
import { KitIcon, KitIconName } from './KitIcon';
import { rankColor, YouBadge } from './SetRows';
import { kt } from './type';

export type Scope = 'public' | 'community';
export type Gender = 'ALL' | 'MALE' | 'FEMALE';

/** Board kicker: icon + "<WORLD> WORLD" in accent (§0.8). */
export function BoardKicker({ tokens: t, icon, text }: { tokens: WorldKitTokens; icon: KitIconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <KitIcon name={icon} size={11} color={t.accentText} strokeWidth={2.6} />
      <Text style={kt('semibold', 10.5, t.accentText, 2.2)} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function Pills<K extends string>({ tokens: t, options, active, onChange }: {
  tokens: WorldKitTokens; options: { key: K; label: string }[]; active: K; onChange: (k: K) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: t.pillTrack, borderWidth: 1, borderColor: t.pillBorder }}>
      {options.map(o => {
        const on = o.key === active;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, backgroundColor: on ? t.accent : 'transparent' }}
          >
            <Text style={kt('semibold', 12, on ? t.onAccent : t.textMuted, 1.4)}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** PUBLIC | MY COMMUNITY (only when in a community) + ALL | MALE | FEMALE. */
export function BoardFilters({ tokens: t, inCommunity, scope, onScope, gender, onGender, style, showGender = true }: {
  tokens: WorldKitTokens; inCommunity: boolean; scope: Scope; onScope: (s: Scope) => void;
  gender: Gender; onGender: (g: Gender) => void; style?: object;
  /** Hide ALL/MALE/FEMALE when the source rows carry no gender. */
  showGender?: boolean;
}) {
  if (!inCommunity && !showGender) return null;
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, style]}>
      {inCommunity && (
        <Pills tokens={t} active={scope} onChange={onScope}
          options={[{ key: 'public', label: 'PUBLIC' }, { key: 'community', label: 'MY COMMUNITY' }]} />
      )}
      {showGender && (
        <View style={{ marginLeft: 'auto' }}>
          <Pills tokens={t} active={gender} onChange={onGender}
            options={[{ key: 'ALL', label: 'ALL' }, { key: 'MALE', label: 'MALE' }, { key: 'FEMALE', label: 'FEMALE' }]} />
        </View>
      )}
    </View>
  );
}

export function filterByGender(rows: BoardRow[], gender: Gender): BoardRow[] {
  if (gender === 'ALL') return rows;
  return rows.filter(r => (r.gender || '').toUpperCase() === gender);
}

const PODIUM_HEIGHTS = [126, 96, 76]; // by place: 1st, 2nd, 3rd

function Podium({ tokens: t, rows, myId }: { tokens: WorldKitTokens; rows: BoardRow[]; myId?: string }) {
  // Visual order 2nd · 1st · 3rd, bottom-aligned.
  const order = [1, 0, 2].filter(i => rows[i]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 26, paddingHorizontal: 24 }}>
      {order.map(i => {
        const r = rows[i];
        const you = r.user_id === myId;
        const first = i === 0;
        const av = first ? 62 : 52;
        const place = [t.gold, t.silver, t.bronze][i];
        return (
          <View key={r.user_id} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 8 }}>
            {first && <KitIcon name="crown" size={20} color={t.gold} />}
            <View style={{
              width: av + (first ? 10 : 0), height: av + (first ? 10 : 0), borderRadius: av,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: first ? `${t.gold}1F` : 'transparent',
            }}>
              <View style={{ width: av, height: av, borderRadius: av / 2, borderWidth: 2, borderColor: you ? t.accent : place, backgroundColor: t.buttonTint, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={kt('bold', first ? 18 : 15, t.text, 1)}>{initials(r.name)}</Text>
              </View>
            </View>
            <Text style={kt('medium', 12, you ? t.accentText : t.textSecondary)} numberOfLines={1}>{r.name}</Text>
            <View style={{
              width: '100%', height: PODIUM_HEIGHTS[i], borderTopLeftRadius: 14, borderTopRightRadius: 14,
              alignItems: 'center', gap: 3, paddingTop: 12,
              backgroundColor: first ? t.tintStrong : t.tint,
              borderWidth: 1, borderBottomWidth: 0, borderColor: t.emptyRowBorder,
            }}>
              <Text style={kt('bold', first ? 30 : 24, place, 0, first ? 32 : 26)}>{i + 1}</Text>
              <Text style={kt('semibold', 15, t.text, 0.4)}>{fmt2(r.points)}</Text>
              <Text style={kt('semibold', 9.5, t.textFaint, 1.4)}>{r.level ?? 'PTS'}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** A 58h board row: rank · country chip · name (+level) · pts. */
export function BoardRowView({ tokens: t, row, index, you, first }: {
  tokens: WorldKitTokens; row: BoardRow; index: number; you: boolean; first: boolean;
}) {
  const code = getCountryCode(row.country);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, paddingHorizontal: 16,
      borderTopWidth: first ? 0 : 1, borderTopColor: t.divider,
      backgroundColor: you ? `${t.accent}17` : 'transparent',
    }}>
      <Text style={[kt('bold', 16, rankColor(t, index, you)), { width: 22, textAlign: 'center' }]}>{index + 1}</Text>
      <View style={{ width: 26, height: 18, borderRadius: 4, backgroundColor: t.button, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={kt('semibold', 10, t.textMuted)}>{code || '—'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[kt(you ? 'medium' : 'regular', 14, you ? t.text : t.textSecondary), { flexShrink: 1 }]} numberOfLines={1}>{row.name}</Text>
          {you && <YouBadge tokens={t} />}
        </View>
        {row.level && <Text style={kt('medium', 9.5, t.textFaint, 1.2)}>{row.level}</Text>}
      </View>
      <Text style={[kt('semibold', 15, t.text), { minWidth: 58, textAlign: 'right' }]}>{fmt2(row.points)}</Text>
    </View>
  );
}

/** Podium + ranks 4–20 (§0.8). `rows` must already be sorted and filtered. */
export function LeaderboardBody({ tokens: t, rows, myId, loading }: {
  tokens: WorldKitTokens; rows: BoardRow[]; myId?: string; loading: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Text style={[kt('medium', 13, t.textFaint, 1.2), { textAlign: 'center', paddingTop: 48 }]}>
        {loading ? 'LOADING…' : 'No warriors on this board yet.'}
      </Text>
    );
  }
  const rest = rows.slice(3, 20);
  return (
    <View>
      <Podium tokens={t} rows={rows} myId={myId} />
      {rest.length > 0 && (
        <View style={{ marginHorizontal: 24, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: t.listBg, borderWidth: 1, borderTopWidth: 0, borderColor: t.emptyRowBorder, overflow: 'hidden' }}>
          {rest.map((r, k) => (
            <BoardRowView key={r.user_id} tokens={t} row={r} index={k + 3} you={r.user_id === myId} first={false} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Pinned "you" bar (§0.8). */
export function YouBar({ tokens: t, rankText, king, ranked, handle, sub, scoreText }: {
  tokens: WorldKitTokens; rankText: string; king: boolean; ranked: boolean; handle: string; sub: string; scoreText: string;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, height: 62, paddingHorizontal: 16, borderRadius: 16,
      backgroundColor: king ? t.goldTintBg : t.tint,
      borderWidth: 1, borderColor: king ? t.goldBorder : `${t.accent}59`,
    }}>
      <Text style={[kt('bold', 20, king ? t.gold : ranked ? t.accentText : t.textDisabled), { width: 44 }]} numberOfLines={1} adjustsFontSizeToFit>{rankText}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[kt('medium', 14, t.text), { flexShrink: 1 }]} numberOfLines={1}>{handle}</Text>
          <YouBadge tokens={t} />
        </View>
        <Text style={[kt('medium', 11.5, t.textMuted, 0.6), { marginTop: 2 }]} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={kt('bold', 18, t.text, 0, 20)}>{scoreText}</Text>
        <Text style={[kt('semibold', 9.5, t.textFaint, 1.4), { marginTop: 3 }]}>PTS</Text>
      </View>
    </View>
  );
}

/** Level ELITE list under the tier switch (§1.3 / §2.2): up to 6 rows or a dashed empty state. */
export function EliteList({ tokens: t, title, rows, loading, myId, filters }: {
  tokens: WorldKitTokens; title: string; rows: BoardRow[]; loading: boolean; myId?: string; filters: React.ReactNode;
}) {
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={kt('semibold', 19, t.text, 2)}>{title}</Text>
        <Text style={kt('medium', 12, t.textMuted, 1.4)}>{`${rows.length} WARRIORS`}</Text>
      </View>
      {filters}
      {rows.length > 0 ? (
        <View style={{ borderRadius: 18, backgroundColor: t.sheetBg, borderWidth: 1, borderColor: t.emptyRowBorder, overflow: 'hidden' }}>
          {rows.slice(0, 6).map((r, i) => (
            <BoardRowView key={r.user_id} tokens={t} row={r} index={i} you={r.user_id === myId} first={i === 0} />
          ))}
        </View>
      ) : (
        <View style={{ borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, paddingVertical: 28, paddingHorizontal: 20 }}>
          <Text style={[kt('regular', 13, t.textMuted), { textAlign: 'center' }]}>
            {loading ? 'LOADING…' : 'No warriors at this level yet.'}
          </Text>
        </View>
      )}
    </View>
  );
}
