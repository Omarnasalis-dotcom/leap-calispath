import { normalize } from '../beatTheLadder';
import {
  GUESS_SKILL_CATALOG,
  HINT_COUNT,
  HINT_LABELS,
  computeScore,
  getHintText,
  isCorrectGuess,
  levenshtein,
  maxEditDistanceFor,
  pickRandomExercise,
  searchGuessSuggestions,
} from '../guessTheSkill';

function byId(id: string) {
  const exercise = GUESS_SKILL_CATALOG.find((e) => e.id === id);
  if (!exercise) throw new Error(`No catalog entry with id "${id}"`);
  return exercise;
}

describe('guessTheSkill', () => {
  describe('GUESS_SKILL_CATALOG data integrity', () => {
    it('has no duplicate ids', () => {
      const ids = GUESS_SKILL_CATALOG.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('never shares a normalized name/alias between two entries', () => {
      // A shared spelling would make a guess ambiguously "correct" for one
      // skill and wrong for another depending on the round.
      const all = GUESS_SKILL_CATALOG.flatMap((e) =>
        [e.name, ...e.aliases].map(normalize)
      );
      expect(new Set(all).size).toBe(all.length);
    });

    it('every entry has a valid movement type and non-empty hint fields', () => {
      for (const e of GUESS_SKILL_CATALOG) {
        expect(['Static', 'Dynamic', 'Static / Dynamic']).toContain(e.movementType);
        expect(e.spatialOrientation.length).toBeGreaterThan(0);
        expect(e.movementPattern.length).toBeGreaterThan(0);
        expect(e.equipment.length).toBeGreaterThan(0);
        expect(e.primaryMuscles.length).toBeGreaterThan(0);
      }
    });

    it('no entry name or alias is within fuzzy range of another entry', () => {
      // Guarantees the typo budget can never turn a correct spelling of one
      // skill into a win on a different skill.
      for (const a of GUESS_SKILL_CATALOG) {
        for (const b of GUESS_SKILL_CATALOG) {
          if (a.id === b.id) continue;
          for (const spelling of [a.name, ...a.aliases]) {
            expect(isCorrectGuess(spelling, b)).toBe(false);
          }
        }
      }
    });
  });

  describe('getHintText', () => {
    it('reveals the five hints in the fixed order for Planche', () => {
      const planche = byId('planche');
      expect(getHintText(planche, 0)).toBe('Static');
      expect(getHintText(planche, 1)).toBe('Horizontal forward lean');
      expect(getHintText(planche, 2)).toBe('Push');
      expect(getHintText(planche, 3)).toBe('Floor / Parallettes');
      expect(getHintText(planche, 4)).toBe('Anterior Deltoids & Lower Back');
    });

    it('supports the hybrid Static / Dynamic movement type', () => {
      expect(getHintText(byId('dragon-flag'), 0)).toBe('Static / Dynamic');
    });

    it('produces a non-empty hint at every index for every entry', () => {
      for (const e of GUESS_SKILL_CATALOG) {
        for (let i = 0; i < HINT_COUNT; i++) {
          expect(getHintText(e, i).length).toBeGreaterThan(0);
        }
      }
    });

    it('has one label per hint', () => {
      expect(HINT_LABELS).toHaveLength(HINT_COUNT);
      expect(HINT_LABELS).toEqual([
        'Movement Type',
        'Spatial Orientation',
        'Movement Pattern',
        'Equipment',
        'Primary Muscles',
      ]);
    });
  });

  describe('computeScore', () => {
    it('costs 100 per revealed hint from a 1000 start', () => {
      expect(computeScore(1)).toBe(900);
      expect(computeScore(2)).toBe(800);
      expect(computeScore(3)).toBe(700);
      expect(computeScore(4)).toBe(600);
      expect(computeScore(5)).toBe(500);
    });

    it('never goes negative', () => {
      expect(computeScore(20)).toBe(0);
    });
  });

  describe('pickRandomExercise', () => {
    it('always returns a catalog member', () => {
      for (let i = 0; i < 20; i++) {
        expect(GUESS_SKILL_CATALOG).toContainEqual(pickRandomExercise());
      }
    });

    it('never returns the excluded exercise', () => {
      const excluded = GUESS_SKILL_CATALOG[0].id;
      for (let i = 0; i < 20; i++) {
        expect(pickRandomExercise(excluded).id).not.toBe(excluded);
      }
    });

    it('accepts an array of ids to exclude, for excluding a whole session', () => {
      const excluded = GUESS_SKILL_CATALOG.slice(0, GUESS_SKILL_CATALOG.length - 1).map((e) => e.id);
      const remaining = GUESS_SKILL_CATALOG[GUESS_SKILL_CATALOG.length - 1].id;
      for (let i = 0; i < 20; i++) {
        expect(pickRandomExercise(excluded).id).toBe(remaining);
      }
    });

    it('can reach every catalog entry, including movements added in the latest expansion', () => {
      // Sweep Math.random across the whole [0, 1) range deterministically so
      // a pool-slicing bug (e.g. off-by-one) can't silently orphan an entry.
      const spy = jest.spyOn(Math, 'random');
      const drawn = new Set<string>();
      for (let i = 0; i < GUESS_SKILL_CATALOG.length; i++) {
        spy.mockReturnValueOnce(i / GUESS_SKILL_CATALOG.length);
        drawn.add(pickRandomExercise().id);
      }
      spy.mockRestore();
      expect(drawn.size).toBe(GUESS_SKILL_CATALOG.length);
      expect(drawn.has('muscle-up')).toBe(true);
      expect(drawn.has('dragon-flag')).toBe(true);
      expect(drawn.has('van-gelder')).toBe(true);
    });
  });

  describe('levenshtein', () => {
    it('measures single-character edits', () => {
      expect(levenshtein('planche', 'planche')).toBe(0);
      expect(levenshtein('planche', 'planch')).toBe(1);
      expect(levenshtein('handstand', 'handstnad')).toBe(2);
    });
  });

  describe('maxEditDistanceFor', () => {
    it('gives short spellings no typo budget, longer ones more', () => {
      expect(maxEditDistanceFor(2)).toBe(0); // "fl"
      expect(maxEditDistanceFor(5)).toBe(0);
      expect(maxEditDistanceFor(6)).toBe(1);
      expect(maxEditDistanceFor(8)).toBe(1);
      expect(maxEditDistanceFor(9)).toBe(2); // "handstand"
    });
  });

  describe('isCorrectGuess', () => {
    it('accepts the exact name', () => {
      expect(isCorrectGuess('Planche', byId('planche'))).toBe(true);
    });

    it('accepts aliases', () => {
      expect(isCorrectGuess('FL', byId('front-lever'))).toBe(true);
      expect(isCorrectGuess('Cross', byId('iron-cross'))).toBe(true);
      expect(isCorrectGuess('SAT', byId('sat'))).toBe(true);
    });

    it('ignores case, spaces, and hyphens', () => {
      expect(isCorrectGuess('l sit', byId('l-sit'))).toBe(true);
      expect(isCorrectGuess('L-SIT', byId('l-sit'))).toBe(true);
      expect(isCorrectGuess('front-lever', byId('front-lever'))).toBe(true);
    });

    it('tolerates small typos in longer names', () => {
      expect(isCorrectGuess('handstnad', byId('handstand'))).toBe(true);
      expect(isCorrectGuess('planch', byId('planche'))).toBe(true);
      expect(isCorrectGuess('iron cros', byId('iron-cross'))).toBe(true);
    });

    it('gives short aliases no typo tolerance', () => {
      expect(isCorrectGuess('fk', byId('front-lever'))).toBe(false);
      expect(isCorrectGuess('hz', byId('handstand'))).toBe(false);
    });

    it('rejects a different skill spelled correctly', () => {
      expect(isCorrectGuess('front lever', byId('back-lever'))).toBe(false);
      expect(isCorrectGuess('front lever pull up', byId('front-lever-press'))).toBe(false);
    });

    it('rejects empty and whitespace-only guesses', () => {
      expect(isCorrectGuess('', byId('planche'))).toBe(false);
      expect(isCorrectGuess('   ', byId('planche'))).toBe(false);
    });
  });

  describe('searchGuessSuggestions', () => {
    it('returns nothing for queries under two normalized characters', () => {
      expect(searchGuessSuggestions('')).toEqual([]);
      expect(searchGuessSuggestions('l')).toEqual([]);
      expect(searchGuessSuggestions(' f ')).toEqual([]);
    });

    it('ranks exact match above substring match', () => {
      // "Cross" is an exact alias of Iron Cross; Victorian Cross only
      // contains it as a substring.
      const names = searchGuessSuggestions('cross').map((e) => e.name);
      expect(names).toEqual(['Iron Cross', 'Victorian Cross']);
    });

    it('substring-matches every lever skill for "lever", ties broken alphabetically', () => {
      const names = searchGuessSuggestions('lever').map((e) => e.name);
      expect(names).toEqual(['Back Lever', 'Front Lever', 'Front Lever Press', 'Front Lever Pull-Up']);
    });

    it('ranks exact match, then prefix, then substring for "planche"', () => {
      const names = searchGuessSuggestions('planche').map((e) => e.name);
      expect(names).toEqual(['Planche', 'Planche Press', 'Planche Push-Up', 'Reverse Planche']);
    });

    it('respects an explicit limit', () => {
      expect(searchGuessSuggestions('an', 1)).toHaveLength(1);
    });

    it('does no fuzzy matching — a typo yields no suggestions', () => {
      // Fuzzy is reserved for submitted guesses so the dropdown never
      // spoils the answer on a near-miss.
      expect(searchGuessSuggestions('handstnad')).toEqual([]);
    });
  });
});
