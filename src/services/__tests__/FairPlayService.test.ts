jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

import i18n from '../../i18n';
import en from '../../i18n/locales/en';
import ar from '../../i18n/locales/ar';
import { APPEAL_REPLY_PRESETS, HOLD_NOTE_PRESETS } from '../../../admin-web/src/shared/fairPlayNotes';
import { describeFlag, FairPlayFlagSummary, holdScopeLabel, resolveTeamNote } from '../FairPlayService';

const flag = (p: Partial<FairPlayFlagSummary>): FairPlayFlagSummary => ({
  area: 'static', movement_id: null, value: null, rule: 'ceiling', created_at: '2026-10-16T00:00:00Z', ...p,
});

describe('describeFlag', () => {
  it('names static holds in seconds', () => {
    expect(describeFlag(flag({ area: 'static', movement_id: 'wall_handstand', value: 900 }))).toBe('Wall Handstand · 900 s');
  });

  it('names endurance sets in reps', () => {
    expect(describeFlag(flag({ area: 'endurance', movement_id: 'inverted_row', value: 70 }))).toBe('Inverted Row · 70 reps');
  });

  it('maps the power columns to their lifts', () => {
    expect(describeFlag(flag({ area: 'power', movement_id: 'pullup_1rm', value: 120 }))).toBe('Weighted Pull-up · 120 kg');
    expect(describeFlag(flag({ area: 'power', movement_id: 'muscleup_1rm', value: 60 }))).toBe('Weighted Muscle-up · 60 kg');
    expect(describeFlag(flag({ area: 'power', movement_id: 'dip_1rm', value: 150 }))).toBe('Weighted Dip · 150 kg');
  });

  it('formats strength trials as a clock', () => {
    expect(describeFlag(flag({ area: 'strength', movement_id: '3', value: 95 }))).toMatch(/Trial · 1:35$/);
  });

  it('falls back when a value or movement is missing', () => {
    expect(describeFlag(flag({ area: 'static', movement_id: 'unknown_hold' }))).toBe('unknown_hold');
    expect(describeFlag(flag({ area: 'weekly', value: 300 }))).toBe('Weekly Challenge · 300');
  });
});

describe('resolveTeamNote', () => {
  afterEach(() => { i18n.changeLanguage('en'); });

  it('shows a preset in the app language', () => {
    expect(resolveTeamNote('tpl:needVideo')).toEqual({ text: en.fairPlay.templates.needVideo, preset: true });
    i18n.changeLanguage('ar');
    expect(resolveTeamNote('tpl:needVideo')).toEqual({ text: ar.fairPlay.templates.needVideo, preset: true });
  });

  it('shows a custom note exactly as typed', () => {
    expect(resolveTeamNote('  Send the video please ')).toEqual({ text: 'Send the video please', preset: false });
  });

  it('shows nothing for no note or an unknown preset', () => {
    expect(resolveTeamNote(null)).toBeNull();
    expect(resolveTeamNote('   ')).toBeNull();
    expect(resolveTeamNote('tpl:addedLater')).toBeNull();
  });

  it('has app text in both languages for every admin preset', () => {
    for (const p of [...HOLD_NOTE_PRESETS, ...APPEAL_REPLY_PRESETS]) {
      expect(en.fairPlay.templates).toHaveProperty(p.id, p.en);
      expect(ar.fairPlay.templates).toHaveProperty(p.id, p.ar);
    }
  });
});

describe('holdScopeLabel', () => {
  it('names the area for a whole-area hold', () => {
    expect(holdScopeLabel({ scope: 'strength', tiers: null })).toBe('STRENGTH');
    expect(holdScopeLabel({ scope: 'all' })).toBe('ALL LEADERBOARDS');
  });

  it('adds the tiers for a per-tier Strength hold', () => {
    expect(holdScopeLabel({ scope: 'strength', tiers: [3] })).toBe('STRENGTH · TIER 3');
    expect(holdScopeLabel({ scope: 'strength', tiers: [3, 5] })).toBe('STRENGTH · TIER 3, TIER 5');
  });
});
