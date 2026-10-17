import { hasCoachEquipment, hasCoachGoalAndDays, needsCoachSetup } from '../coachSetup';

describe('coachSetup', () => {
  const complete = { goals: ['strength'], goal_other_text: null, training_days_per_week: 3, available_equipment: ['rings'] };

  it('a fully answered profile skips setup', () => {
    expect(needsCoachSetup(complete)).toBe(false);
  });

  it('"No equipment" (empty array) is a real answer, null is not', () => {
    expect(hasCoachEquipment({ ...complete, available_equipment: [] })).toBe(true);
    expect(needsCoachSetup({ ...complete, available_equipment: [] })).toBe(false);
    expect(needsCoachSetup({ ...complete, available_equipment: null })).toBe(true);
    expect(needsCoachSetup({ ...complete, available_equipment: undefined })).toBe(true);
  });

  it('an existing member with goal + equipment but no days still needs setup', () => {
    expect(needsCoachSetup({ ...complete, training_days_per_week: null })).toBe(true);
    expect(hasCoachGoalAndDays({ ...complete, training_days_per_week: null })).toBe(false);
  });

  it('falls back to the legacy primary_goal', () => {
    expect(hasCoachGoalAndDays({ ...complete, goals: null, primary_goal: 'muscle' })).toBe(true);
    expect(hasCoachGoalAndDays({ ...complete, goals: [], primary_goal: null })).toBe(false);
  });

  it('"other" alone needs its description', () => {
    expect(hasCoachGoalAndDays({ ...complete, goals: ['other'], goal_other_text: '  ' })).toBe(false);
    expect(hasCoachGoalAndDays({ ...complete, goals: ['other'], goal_other_text: 'Front lever' })).toBe(true);
  });

  it('no profile needs setup', () => {
    expect(needsCoachSetup(null)).toBe(true);
  });
});
