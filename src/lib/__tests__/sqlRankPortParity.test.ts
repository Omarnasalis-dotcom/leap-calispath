/**
 * Drift guard between calculateSpartanRank (TS) and public.calculate_spartan_rank
 * (SQL, added in 20260810120000_validate_initial_assessment_tier.sql).
 *
 * The tier is now derived SERVER-side from raw reps, because the old flow let a
 * client send any tier it liked. That means the two implementations must agree
 * exactly — if they diverge, honest users get scored differently by the server
 * than the app's own preview showed them.
 *
 * `sqlRank` below is a line-by-line transcription of the SQL function. If you
 * change spartanLogic.ts, this test fails, which is the signal to update BOTH
 * the migration and this transcription. Do not "fix" the test by editing only
 * `sqlRank` — that would hide real drift from the database.
 */
import { calculateSpartanRank, MovementVariant, StrengthAssessment } from '../spartanLogic';

// --- transcription of public.calculate_spartan_rank ---
function sqlRank(
  pv: string, pr: number,
  dv: string, dr: number,
  sv: string, sr: number,
  mv: string | null, mr: number | null
): number {
  let pullup: number;
  if (pv === 'strict_pullup' && pr >= 15) pullup = 7;
  else if (pv === 'strict_pullup' && pr >= 10) pullup = 6;
  else if (pv === 'strict_pullup' && pr >= 6) pullup = 5;
  else if (pv === 'strict_pullup' && pr >= 1) pullup = 4;
  else if (['strict_pullup', 'assisted_pullup'].includes(pv) && pr >= 10) pullup = 3;
  else if (['strict_pullup', 'assisted_pullup'].includes(pv) && pr >= 5) pullup = 2;
  else if (pr >= 5) pullup = 1;
  else pullup = 0;

  let dip: number;
  if (dv === 'standard_dip' && dr >= 30) dip = 7;
  else if (dv === 'standard_dip' && dr >= 20) dip = 6;
  else if (dv === 'standard_dip' && dr >= 15) dip = 5;
  else if (dv === 'standard_dip' && dr >= 10) dip = 4;
  else if (dv === 'standard_dip' && dr >= 5) dip = 3;
  else if (dr >= 10) dip = 2;
  else if (dr >= 5) dip = 1;
  else dip = 0;

  let push: number;
  if (sv === 'standard_pushup' && sr >= 50) push = 7;
  else if (sv === 'standard_pushup' && sr >= 40) push = 6;
  else if (sv === 'standard_pushup' && sr >= 30) push = 5;
  else if (sv === 'standard_pushup' && sr >= 20) push = 4;
  else if (sv === 'standard_pushup' && sr >= 15) push = 3;
  else if (sv === 'standard_pushup' && sr >= 10) push = 2;
  else if (sr >= 5) push = 1;
  else push = 0;

  let mu: number;
  if (mv === null || mr === null) mu = 0;
  else if (mv === 'strict_mu' && mr >= 6) mu = 7;
  else if (mv === 'strict_mu' && mr >= 3) mu = 6;
  else if (mv === 'strict_mu' && mr >= 1) mu = 5;
  else if (['strict_mu', 'banded_mu'].includes(mv) && mr >= 1) mu = 4;
  else mu = 3;

  return Math.min(Math.min(pullup, dip), Math.min(push, mu), 7);
}

const PULL: MovementVariant[] = ['inverted_row', 'assisted_pullup', 'strict_pullup'];
const DIP: MovementVariant[] = ['bench_dip', 'standard_dip'];
const PUSH: MovementVariant[] = ['knee_pushup', 'standard_pushup'];
const MU: MovementVariant[] = ['jumping_mu', 'banded_mu', 'strict_mu'];
const REPS = [0, 1, 4, 5, 6, 9, 10, 14, 15, 19, 20, 29, 30, 39, 40, 49, 50, 60];

describe('SQL calculate_spartan_rank matches calculateSpartanRank', () => {
  it('agrees on every variant combination across boundary rep values', () => {
    const mismatches: string[] = [];
    let checked = 0;

    for (const pv of PULL) for (const dv of DIP) for (const sv of PUSH) for (const mv of MU) {
      for (const r of REPS) {
        const assessment: StrengthAssessment = {
          pullups: { reps: r, variant: pv },
          dips: { reps: r, variant: dv },
          pushups: { reps: r, variant: sv },
          muscleups: { reps: r, variant: mv },
        };
        const js = calculateSpartanRank(assessment);
        const sql = sqlRank(pv, r, dv, r, sv, r, mv, r);
        checked++;
        if (js !== sql) mismatches.push(`${pv}/${dv}/${sv}/${mv} @${r}: js=${js} sql=${sql}`);
      }
    }

    // Mixed reps per movement — the weakest-link rule is the whole point.
    for (const pr of REPS) for (const dr of REPS) for (const sr of REPS) {
      const assessment: StrengthAssessment = {
        pullups: { reps: pr, variant: 'strict_pullup' },
        dips: { reps: dr, variant: 'standard_dip' },
        pushups: { reps: sr, variant: 'standard_pushup' },
        muscleups: { reps: 6, variant: 'strict_mu' },
      };
      const js = calculateSpartanRank(assessment);
      const sql = sqlRank('strict_pullup', pr, 'standard_dip', dr, 'standard_pushup', sr, 'strict_mu', 6);
      checked++;
      if (js !== sql) mismatches.push(`mixed ${pr}/${dr}/${sr}: js=${js} sql=${sql}`);
    }

    console.log(`parity cases checked: ${checked}`);
    expect(mismatches).toEqual([]);
  });

  it('replicates the missing-muscle-up collapse to 0', () => {
    const assessment = {
      pullups: { reps: 15, variant: 'strict_pullup' as MovementVariant },
      dips: { reps: 30, variant: 'standard_dip' as MovementVariant },
      pushups: { reps: 50, variant: 'standard_pushup' as MovementVariant },
    } as StrengthAssessment;
    expect(calculateSpartanRank(assessment)).toBe(0);
    expect(sqlRank('strict_pullup', 15, 'standard_dip', 30, 'standard_pushup', 50, null, null)).toBe(0);
  });

  it('never exceeds the tier-7 assessment cap', () => {
    const max = sqlRank('strict_pullup', 999, 'standard_dip', 999, 'standard_pushup', 999, 'strict_mu', 999);
    expect(max).toBe(7);
  });
});
