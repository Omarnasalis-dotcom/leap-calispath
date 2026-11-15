import { classifyNewExerciseNames, findLibraryMatch, normalizeExerciseName, suggestLibraryExercises } from '../exerciseNameMatch';

// Names taken from the prod library (2026-11-15), including its misspellings.
const library = [
  { id: 'childe', name: 'Childe Pose' },
  { id: 'child-sided', name: 'Child Pose Sided' },
  { id: 'high-pull', name: 'High Pull Ups' },
  { id: 'banded-high-pull', name: 'Banded High Pull Up' },
  { id: 'glute', name: 'Single leg Glutes Bridg' },
  { id: 'sl-deadlift', name: 'Single Leg Deadlift' },
  { id: 'incline', name: 'Incline DB Bench Press' },
  { id: 'pseudo', name: 'Pusedo Planche Push Ups' },
  { id: 'deadlift-1', name: 'Deadlift' },
  { id: 'deadlift-2', name: 'Deadlift' },
  { id: 'press', name: 'Bench Press' },
];

describe('normalizeExerciseName', () => {
  it('ignores case, spacing, punctuation and a plural s', () => {
    expect(normalizeExerciseName('  High  Pull-Ups ')).toBe('high pull up');
    expect(normalizeExerciseName('high pull up')).toBe('high pull up');
  });
  it('keeps "ss" endings', () => {
    expect(normalizeExerciseName('Bench Press')).toBe('bench press');
  });
});

describe('findLibraryMatch', () => {
  it('matches the same name ignoring case first', () => {
    expect(findLibraryMatch('childe pose', library)?.id).toBe('childe');
  });
  it('matches a plural / spacing difference without asking', () => {
    expect(findLibraryMatch('High Pull Up', library)?.id).toBe('high-pull');
    expect(findLibraryMatch('Bench  Press', library)?.id).toBe('press');
  });
  it('does not guess at a typo or a missing word', () => {
    expect(findLibraryMatch('Child Pose', library)).toBeNull();
    expect(findLibraryMatch('Incline DB Press', library)).toBeNull();
    expect(findLibraryMatch('Dragon Flag', library)).toBeNull();
  });
});

describe('suggestLibraryExercises', () => {
  const ids = (name: string) => suggestLibraryExercises(name, library).map((r) => r.id);

  it('suggests the near spelling first', () => {
    expect(ids('Child Pose')[0]).toBe('childe');
    expect(ids('Child Pose')).toContain('child-sided');
    expect(ids('Single Leg Glutes Bridge')[0]).toBe('glute');
  });
  it('suggests a name with one extra or missing word', () => {
    expect(ids('Incline DB Press')[0]).toBe('incline');
    expect(ids('Tuck Pusedo Planche Push Ups')[0]).toBe('pseudo');
  });
  it('suggests nothing when nothing is close', () => {
    expect(ids('Dragon Flag')).toEqual([]);
  });
  it('shows a duplicated library name once', () => {
    expect(suggestLibraryExercises('Deadlifts heavy', library).filter((r) => r.name === 'Deadlift')).toHaveLength(1);
  });
  it('returns at most the limit', () => {
    expect(suggestLibraryExercises('Single Leg', library, 1)).toHaveLength(1);
  });
});

describe('classifyNewExerciseNames (CSV bulk add)', () => {
  const lib = [
    { id: '1', name: 'Deadlift' },
    { id: '2', name: 'Bulgarin Lunges' },
    { id: '3', name: 'Incline Push Ups' },
    { id: '4', name: 'Tuck Back Lever Hold' },
  ];
  const kinds = (names: string[]) => classifyNewExerciseNames(names, lib).map((s) => s.kind);

  it('skips names already in the library, including case/plural differences', () => {
    expect(classifyNewExerciseNames(['deadlifts'], lib)).toEqual([{ kind: 'exists', match: 'Deadlift' }]);
  });
  it('skips a row that repeats an earlier row', () => {
    expect(kinds(['Nordic Curl', 'nordic curls'])).toEqual(['new', 'repeat']);
  });
  it('flags a likely misspelling but does not skip it', () => {
    expect(classifyNewExerciseNames(['Bulgarian Lunges'], lib)).toEqual([{ kind: 'similar', similar: 'Bulgarin Lunges' }]);
  });
  it('treats a different exercise as new', () => {
    expect(kinds(['Tuck Front Lever Hold', 'Wall Sit'])).toEqual(['new', 'new']);
  });
});
