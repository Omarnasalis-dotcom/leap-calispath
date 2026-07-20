import {
  LADDER_EXERCISES,
  LadderExercise,
  WHEEL_BONUS_TASKS,
  getBonusTasksByTier,
  getDifficultyBand,
  getStarterExercise,
  normalize,
  pickRandomBonusTask,
  searchLadderExercises,
  validateMove,
} from '../beatTheLadder';

describe('beatTheLadder', () => {
  describe('normalize', () => {
    it('lowercases, and strips spaces, hyphens, parentheses, and periods', () => {
      expect(normalize('Push-Up')).toBe('pushup');
      expect(normalize('High Plank')).toBe('highplank');
      expect(normalize('Triceps Dips (Box)')).toBe('tricepsdipsbox');
      expect(normalize('90° Press to Handstand')).toBe('90presstohandstand');
    });

    it('makes differently-formatted spellings of the same move match', () => {
      expect(normalize('Muscle-up')).toBe(normalize('MUSCLE UP'));
      expect(normalize('Muscle-up')).toBe(normalize('muscleup'));
    });
  });

  describe('getStarterExercise', () => {
    it('is High Plank — the lowest-difficulty exercise in the catalog', () => {
      const starter = getStarterExercise();
      expect(starter.id).toBe('high-plank');
      expect(starter.difficulty).toBe(Math.min(...LADDER_EXERCISES.map((e) => e.difficulty)));
    });
  });

  describe('searchLadderExercises', () => {
    it('returns nothing for an empty query', () => {
      expect(searchLadderExercises('', [])).toEqual([]);
    });

    it('resolves an unambiguous alias to its exercise', () => {
      const results = searchLadderExercises('MU', []);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Muscle-up');
    });

    it('surfaces both matches on an ambiguous alias, instead of guessing', () => {
      // "PU" is real gym shorthand for both — the game should show both and
      // let the player pick, never silently resolve to one.
      const results = searchLadderExercises('PU', []);
      expect(results.some((e) => e.name === 'Push-up')).toBe(true);
      expect(results.some((e) => e.name === 'Pull-up')).toBe(true);
    });

    it('is case, space, and hyphen insensitive', () => {
      const results = searchLadderExercises('MUSCLE UP', []);
      expect(results.some((e) => e.name === 'Muscle-up')).toBe(true);
    });

    it('excludes exercises already used in the current chain', () => {
      const results = searchLadderExercises('planche', ['full-planche']);
      expect(results.some((e) => e.id === 'full-planche')).toBe(false);
      expect(results.some((e) => e.id === 'straddle-planche')).toBe(true);
    });

    it('ranks exact match, then prefix match, then substring match — ties by difficulty', () => {
      // "Full Planche" carries the alias "Planche", an exact match to the
      // query, so it should rank first even though its own name is only a
      // substring match.
      const results = searchLadderExercises('planche', []);
      expect(results.map((e) => e.name)).toEqual([
        'Full Planche',               // exact match (via alias "Planche")
        'Planche Push-up',            // prefix match, lower difficulty
        'Planche Press to Handstand', // prefix match, higher difficulty
        'Straddle Planche',           // substring match, ascending difficulty from here
        'Pelican Planche',            // 1700, between Straddle (980) and One Arm (1850)
        'One Arm Planche',
        'Reverse Planche',
      ]);
    });

    it('defaults to at most 8 results', () => {
      const results = searchLadderExercises('a', []);
      expect(results.length).toBeLessThanOrEqual(8);
    });

    it('respects an explicit limit', () => {
      const results = searchLadderExercises('a', [], 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('validateMove', () => {
    const easy: LadderExercise = { id: 'easy', name: 'Easy', aliases: [], difficulty: 10 };
    const hard: LadderExercise = { id: 'hard', name: 'Hard', aliases: [], difficulty: 20 };

    it('accepts an unused exercise strictly harder than the current one', () => {
      expect(validateMove(hard, ['easy'], 10)).toEqual({ valid: true });
    });

    it('rejects an exercise already used in this chain', () => {
      expect(validateMove(hard, ['easy', 'hard'], 10)).toEqual({
        valid: false,
        reason: 'already_used',
      });
    });

    it('rejects an exercise no harder than the current difficulty', () => {
      expect(validateMove(easy, [], 10)).toEqual({ valid: false, reason: 'too_easy' });
    });

    it('rejects an exercise at exactly the current difficulty — strictly greater is required', () => {
      expect(validateMove(hard, [], 20)).toEqual({ valid: false, reason: 'too_easy' });
    });
  });

  describe('getDifficultyBand', () => {
    it('bands values at each boundary correctly', () => {
      expect(getDifficultyBand(30)).toBe('Foundation');
      expect(getDifficultyBand(299)).toBe('Foundation');
      expect(getDifficultyBand(300)).toBe('Intermediate');
      expect(getDifficultyBand(599)).toBe('Intermediate');
      expect(getDifficultyBand(600)).toBe('Advanced');
      expect(getDifficultyBand(999)).toBe('Advanced');
      expect(getDifficultyBand(1000)).toBe('Elite');
      expect(getDifficultyBand(1599)).toBe('Elite');
      expect(getDifficultyBand(1600)).toBe('Legendary');
      expect(getDifficultyBand(2350)).toBe('Legendary');
    });
  });

  describe('LADDER_EXERCISES data integrity', () => {
    it('has no duplicate ids', () => {
      const ids = LADDER_EXERCISES.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('has no duplicate difficulty scores', () => {
      // Ties would let a strictly-greater-than check reject two exercises
      // that were meant to feel equivalent — uniqueness is enforced here
      // instead of with runtime tie-break logic.
      const difficulties = LADDER_EXERCISES.map((e) => e.difficulty);
      expect(new Set(difficulties).size).toBe(difficulties.length);
    });

    it('is sorted in strictly increasing difficulty order', () => {
      for (let i = 1; i < LADDER_EXERCISES.length; i++) {
        expect(LADDER_EXERCISES[i].difficulty).toBeGreaterThan(LADDER_EXERCISES[i - 1].difficulty);
      }
    });
  });

  describe('getBonusTasksByTier', () => {
    it("'random' returns every bonus task", () => {
      expect(getBonusTasksByTier('random')).toEqual(WHEEL_BONUS_TASKS);
    });

    it('easy/medium/hard each return only tasks tagged with that tier', () => {
      for (const tier of ['easy', 'medium', 'hard'] as const) {
        const tasks = getBonusTasksByTier(tier);
        expect(tasks.length).toBeGreaterThan(0);
        expect(tasks.every((t) => t.tier === tier)).toBe(true);
      }
    });
  });

  describe('pickRandomBonusTask', () => {
    it('always returns a task from the given pool', () => {
      const pool = getBonusTasksByTier('easy');
      for (let i = 0; i < 20; i++) {
        expect(pool).toContainEqual(pickRandomBonusTask(pool));
      }
    });

    it('never returns the excluded task, given other options exist', () => {
      const pool = getBonusTasksByTier('random');
      const excluded = pool[0].exerciseId;
      for (let i = 0; i < 20; i++) {
        expect(pickRandomBonusTask(pool, excluded).exerciseId).not.toBe(excluded);
      }
    });
  });

  describe('WHEEL_BONUS_TASKS data integrity', () => {
    it('every bonus task points at a real ladder exercise', () => {
      const realIds = new Set(LADDER_EXERCISES.map((e) => e.id));
      for (const task of WHEEL_BONUS_TASKS) {
        expect(realIds.has(task.exerciseId)).toBe(true);
      }
    });

    it('has no duplicate exercise ids', () => {
      const ids = WHEEL_BONUS_TASKS.map((t) => t.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every task has a valid tier', () => {
      for (const task of WHEEL_BONUS_TASKS) {
        expect(['easy', 'medium', 'hard']).toContain(task.tier);
      }
    });
  });
});
