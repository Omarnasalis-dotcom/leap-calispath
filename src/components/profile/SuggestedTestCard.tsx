import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STATIC_MOVEMENTS, STATIC_CATEGORIES } from '../../lib/staticLogic';
import { POWER_MOVEMENTS } from '../../lib/powerLogic';
import { ONEMM_MOVEMENTS, ONEMM_CATEGORIES } from '../../lib/oneMMLogic';

type WorldId = 'static' | 'power' | '1mm';

interface SuggestedTestCardProps {
  userId: string;
  staticPts: number;
  powerPts: number;
  mmPts: number;
  strengthTier: number;
  staticPbs: Record<string, number>;
  powerPbs: Record<string, number>;
  oneMMPbs: Record<string, number>;
  onOpenStatic: () => void;
  onOpenPower: () => void;
  onOpenOneMinMax: (category?: 'entry' | 'main' | 'advanced') => void;
  theme: any;
}

const DISCIPLINES: Record<WorldId, { label: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  static: { label: 'STATIC', color: '#7E57C2', icon: 'snowflake' },
  power: { label: 'POWER', color: '#FF5252', icon: 'lightning-bolt' },
  '1mm': { label: '1-MINUTE MAX', color: '#FF7043', icon: 'timer-outline' },
};

const ONEMM_PATTERN_LABELS: Record<string, string> = {
  push: 'PUSH', pull: 'PULL', dip: 'DIP', squat: 'SQUAT', deadlift: 'DEADLIFT',
  muscle_up: 'MUSCLE-UP', hspu: 'HANDSTAND PUSH-UP', fl_press: 'FRONT LEVER PRESS',
  fl_pull: 'FRONT LEVER PULL', planche: 'PLANCHE',
};

const MAX_CONSECUTIVE_SAME_WORLD = 2;

// Bump whenever getUnitsForWorld/computeSuggestion's picking logic changes —
// otherwise a device with an already-cached RotationState (and unchanged
// points since) would keep replaying the OLD suggestion forever via the
// "replay unchanged" shortcut below, never seeing the new algorithm until
// their points next move.
const ROTATION_SCHEMA_VERSION = 2;

interface SuggestionUnit {
  key: string;
  title: string;
  // categoryId is only meaningful for 1MM pills — it's what tells
  // OneMinMaxScreen which level tab (Entry/Main/Advanced) to open on, since
  // the same movement can be invisible under the wrong tab.
  pills: { id: string; name: string; categoryId?: 'entry' | 'main' | 'advanced' }[];
}

interface RotationState {
  version: number;
  lastWorld: WorldId;
  worldStreak: number;
  lastUnit: SuggestionUnit;
  lastPts: Record<WorldId, number>;
}

/**
 * Enumerates candidate "units" for a world — a category (Static) or
 * movement pattern (1MM) with its 2 weakest movements as pill options, or
 * (Power, which has no categories) a single unit covering the 2 weakest of
 * its 4 movements. Sorted weakest-first so [0] is the default pick.
 */
function getUnitsForWorld(
  world: WorldId,
  strengthTier: number,
  staticPbs: Record<string, number>,
  powerPbs: Record<string, number>,
  oneMMPbs: Record<string, number>,
): SuggestionUnit[] {
  if (world === 'static') {
    const categories = Object.keys(STATIC_CATEGORIES) as (keyof typeof STATIC_CATEGORIES)[];
    return categories
      .map(cat => {
        const movements = STATIC_MOVEMENTS
          .filter(m => m.category === cat)
          .map(m => ({ id: m.id, name: m.name, score: (staticPbs[m.id] || 0) * m.multiplier, level: m.level }))
          .sort((a, b) => a.score - b.score || a.level - b.level);
        const peak = Math.max(0, ...movements.map(m => m.score));
        return { key: cat, title: STATIC_CATEGORIES[cat].name.toUpperCase(), pills: movements.slice(0, 2), peak };
      })
      .sort((a, b) => a.peak - b.peak);
  }

  if (world === '1mm') {
    // Restrict candidates to the user's CURRENT level (Entry: tier 0-4,
    // Main/Advanced: tier 5+) instead of every unlocked movement — minTier
    // alone isn't enough, since a tier-5+ user still passes the minTier<=
    // check for Entry movements too, and sorting by score (tied at 0 for
    // anything untried) would keep picking the easiest Entry variant
    // forever instead of the Main/Advanced movement they should be doing.
    const isAdvancedLevel = strengthTier >= 5;
    const levelMovements = ONEMM_MOVEMENTS.filter(m => isAdvancedLevel ? m.categoryId !== 'entry' : m.categoryId === 'entry');

    const scoreOf = (m: typeof ONEMM_MOVEMENTS[number]) => (oneMMPbs[m.id] || 0) * (ONEMM_CATEGORIES[m.categoryId]?.multiplier || 1);

    const patterns = Array.from(new Set(levelMovements.map(m => m.patternId)));
    const patternUnits = patterns
      .map(pattern => {
        const movements = levelMovements
          .filter(m => m.patternId === pattern)
          .map(m => ({ id: m.id, name: m.name, score: scoreOf(m), categoryId: m.categoryId }))
          .sort((a, b) => a.score - b.score);
        const peak = Math.max(0, ...movements.map(m => m.score));
        return { key: pattern, title: (ONEMM_PATTERN_LABELS[pattern] || pattern).toUpperCase(), pills: movements, peak };
      })
      .filter(u => u.pills.length >= 2);

    // Entry-level patterns (Push/Pull/Dip/Squat) each have 2 real movement
    // variants, so within-pattern pills work there and the title can safely
    // name that one pattern. Once a user reaches Main/Advanced, most
    // patterns collapse to a single movement — fall back to the 2
    // overall-weakest movements at this level (cross-pattern, same shape
    // Power already uses). Since those 2 pills can span 2 different
    // patterns, the title stays generic here (no single pattern name would
    // be accurate for both pills) — same convention as Power's title.
    if (patternUnits.length > 0) {
      return patternUnits.map(u => ({ ...u, pills: u.pills.slice(0, 2) })).sort((a, b) => a.peak - b.peak);
    }

    const weakest = levelMovements
      .map(m => ({ id: m.id, name: m.name, score: scoreOf(m), categoryId: m.categoryId }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 2);
    return [{ key: 'onemm-crosspattern', title: '', pills: weakest }];
  }

  // Power has only 4 movements and no categories — a single unit covering
  // the 2 weakest by weighted PB. No rotation exclusion applies here (see
  // computeSuggestion), since there's nothing meaningful to rotate to.
  const movements = POWER_MOVEMENTS
    .map(m => ({ id: m.id, name: m.name, score: (powerPbs[m.id] || 0) * m.multiplier }))
    .sort((a, b) => a.score - b.score);
  return [{ key: 'power', title: '', pills: movements.slice(0, 2) }];
}

/**
 * Picks the next world+unit to suggest, applying two rotation rules on top
 * of the base "lowest points wins" heuristic:
 *   1. Never suggest the same category/pattern twice in a row (Static/1MM
 *      only — Power has no categories to rotate through).
 *   2. Never suggest the same world more than MAX_CONSECUTIVE_SAME_WORLD
 *      times in a row, even if it's still the lowest-scoring world — the
 *      next-lowest world takes over until it's caught up too.
 * Re-renders with unchanged points (no test completed) replay the exact
 * previous suggestion instead of re-rolling, so the rotation only advances
 * on real progress.
 */
function computeSuggestion(
  rotation: RotationState | null,
  pts: Record<WorldId, number>,
  strengthTier: number,
  staticPbs: Record<string, number>,
  powerPbs: Record<string, number>,
  oneMMPbs: Record<string, number>,
): { world: WorldId; unit: SuggestionUnit; rotation: RotationState } {
  const worlds: WorldId[] = ['static', 'power', '1mm'];

  // A version mismatch means the picking algorithm changed since this was
  // saved — treat it as no history at all rather than trusting stale
  // fields (or worse, replaying a suggestion the current algorithm would
  // never have produced).
  if (rotation && rotation.version !== ROTATION_SCHEMA_VERSION) {
    rotation = null;
  }

  if (rotation && worlds.every(w => rotation.lastPts[w] === pts[w])) {
    return { world: rotation.lastWorld, unit: rotation.lastUnit, rotation };
  }

  const rankedAsc = [...worlds].sort((a, b) => pts[a] - pts[b]);
  const rawLowest = rankedAsc[0];

  let chosenWorld = rawLowest;
  if (rotation && rotation.lastWorld === rawLowest && rotation.worldStreak >= MAX_CONSECUTIVE_SAME_WORLD) {
    chosenWorld = rankedAsc.find(w => w !== rawLowest) || rawLowest;
  }

  const stayingInSameWorld = !!rotation && rotation.lastWorld === chosenWorld;
  const units = getUnitsForWorld(chosenWorld, strengthTier, staticPbs, powerPbs, oneMMPbs);
  const excludeKey = stayingInSameWorld && chosenWorld !== 'power' ? rotation!.lastUnit.key : undefined;
  const candidates = excludeKey && units.length > 1 ? units.filter(u => u.key !== excludeKey) : units;
  const unit = candidates[0];

  return {
    world: chosenWorld,
    unit,
    rotation: {
      version: ROTATION_SCHEMA_VERSION,
      lastWorld: chosenWorld,
      worldStreak: stayingInSameWorld ? rotation!.worldStreak + 1 : 1,
      lastUnit: unit,
      lastPts: pts,
    },
  };
}

export function SuggestedTestCard({
  userId, staticPts, powerPts, mmPts, strengthTier,
  staticPbs, powerPbs, oneMMPbs,
  onOpenStatic, onOpenPower, onOpenOneMinMax,
  theme,
}: SuggestedTestCardProps) {
  const storageKey = `suggested_test_rotation_${userId}`;
  const [rotation, setRotation] = useState<RotationState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (cancelled) return;
        const parsed = raw ? JSON.parse(raw) : null;
        // Guards against stale data from an older rotation-state shape or
        // algorithm version already persisted on-device — anything that
        // doesn't match is treated as no history rather than crashing on a
        // missing field or silently replaying an outdated suggestion.
        const isValid = parsed && parsed.version === ROTATION_SCHEMA_VERSION && parsed.lastUnit && Array.isArray(parsed.lastUnit.pills);
        setRotation(isValid ? parsed : null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [storageKey]);

  const pts: Record<WorldId, number> = { static: staticPts, power: powerPts, '1mm': mmPts };

  const result = useMemo(
    () => (loaded ? computeSuggestion(rotation, pts, strengthTier, staticPbs, powerPbs, oneMMPbs) : null),
    [loaded, rotation, staticPts, powerPts, mmPts, strengthTier, staticPbs, powerPbs, oneMMPbs]
  );

  useEffect(() => {
    if (!result || result.rotation === rotation) return;
    setRotation(result.rotation);
    AsyncStorage.setItem(storageKey, JSON.stringify(result.rotation)).catch(() => {});
  }, [result]);

  if (!result) return null;

  const meta = DISCIPLINES[result.world];
  const fillPct = Math.max(4, Math.min(100, (pts[result.world] / 50) * 100));
  const displayTitle = result.unit.title || `${meta.label} needs attention`;

  // 1MM's Entry/Main/Advanced tabs are separate filtered views in
  // OneMinMaxScreen — landing on the wrong one hides the suggested
  // movement entirely, so each pill carries the category that unlocks it.
  const handlePillPress = (pill: SuggestionUnit['pills'][number]) => {
    if (result.world === '1mm') onOpenOneMinMax(pill.categoryId);
    else if (result.world === 'static') onOpenStatic();
    else onOpenPower();
  };

  return (
    <View style={[styles.card, { borderColor: `${meta.color}40`, backgroundColor: `${meta.color}0D` }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: `${meta.color}20`, borderColor: meta.color }]}>
          <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.eyebrow, { color: meta.color }]}>SUGGESTED NEXT — {meta.label}</Text>
          <Text style={[styles.title, { color: theme.text.primary }]}>{displayTitle}</Text>
          <View style={[styles.track, { backgroundColor: `${meta.color}20` }]}>
            <View style={[styles.trackFill, { backgroundColor: meta.color, width: `${fillPct}%` }]} />
          </View>
        </View>
      </View>

      {/* Pill options — tapping either opens the discipline's world screen
          (Static/Power don't support preselecting a specific movement yet,
          so those two pills both just open the world screen generally). */}
      <View style={styles.pillsRow}>
        {result.unit.pills.map(pill => (
          <TouchableOpacity
            key={pill.id}
            style={[styles.pill, { borderColor: `${meta.color}50`, backgroundColor: `${meta.color}14` }]}
            onPress={() => handlePillPress(pill)}
            activeOpacity={0.75}
          >
            <Text style={[styles.pillText, { color: meta.color }]} numberOfLines={1}>{pill.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    marginLeft: 12,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 8,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans-Bold',
  },
});
