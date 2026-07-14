import { ONEMM_MOVEMENTS, OneMMMovement } from './oneMMLogic';
import { STATIC_MOVEMENTS, StaticMovement } from './staticLogic';
import { POWER_MOVEMENTS, PowerMovement } from './powerLogic';
import { TIER_HARD_FLOORS, POWER_TIER_REQUIREMENTS } from '../constants/Progression';

export type FocusTag = 'PULL' | 'PUSH' | 'LEGS' | 'FULL_BODY' | 'CORE' | 'NONE';
export type World = 'ENDURANCE' | 'POWER' | 'STATIC';

export interface AssessmentRecommendation {
  world: World;
  movementId: string;
  movementName: string;
  isPriority: boolean;
  priorityReason?: string;
  isUntouched?: boolean;
}

export class AssessmentEngine {
  /**
   * Determine the user's weakest world based on point accumulation
   */
  static getWeakestWorld(oneMmPoints: number, powerPoints: number, staticPoints: number, strengthTier: number): World {
    // If they haven't unlocked Power (tier 6) or Static (tier 1), Endurance is the only world
    if (strengthTier < 1) return 'ENDURANCE';

    // Normalize scores to a basic 0-100 scale for comparison based on mid-tier expectations
    const enduranceNorm = Math.min((oneMmPoints / 200) * 100, 100);
    const staticNorm = strengthTier >= 1 ? Math.min((staticPoints / 50) * 100, 100) : 100;
    const powerNorm = strengthTier >= 6 ? Math.min((powerPoints / 140) * 100, 100) : 100;

    if (enduranceNorm <= staticNorm && enduranceNorm <= powerNorm) return 'ENDURANCE';
    if (staticNorm <= enduranceNorm && staticNorm <= powerNorm) return 'STATIC';
    return 'POWER';
  }

  /**
   * Get valid tests for a given Focus Tag
   */
  static getTestsForTag(tag: FocusTag, strengthTier: number) {
    let oneMmIds: string[] = [];
    let powerIds: string[] = [];
    let staticIds: string[] = [];

    switch (tag) {
      case 'PULL':
        oneMmIds = ['muscle_ups', 'pull_ups', 'assisted_pull_ups', 'inverted_row'];
        powerIds = ['muscle_up', 'pull_up'];
        staticIds = ['full_front_lever', 'straddle_front_lever', 'tuck_front_lever'];
        break;
      case 'PUSH':
        oneMmIds = ['planche_push_ups', 'hspu', 'dips', 'push_ups', 'incline_push_ups', 'bench_dips', 'knee_push_ups'];
        powerIds = ['dip'];
        staticIds = ['full_planche', 'straddle_planche', 'tuck_planche'];
        break;
      case 'LEGS':
      case 'CORE':
        oneMmIds = ['goblet_squats', 'air_squats'];
        powerIds = ['squat'];
        staticIds = ['one_arm_handstand', 'freestanding_handstand', 'wall_handstand']; // Balance focus
        break;
      case 'FULL_BODY':
        oneMmIds = ['muscle_ups', 'deadlift'];
        powerIds = ['muscle_up'];
        staticIds = ['full_back_lever', 'straddle_back_lever', 'tuck_back_lever'];
        break;
      default:
        oneMmIds = ['pull_ups', 'push_ups', 'air_squats'];
        powerIds = ['pull_up'];
        staticIds = ['tuck_front_lever'];
    }

    // Filter OneMM by Tier
    const validOneMm = oneMmIds
      .map(id => ONEMM_MOVEMENTS.find(m => m.id === id))
      .filter((m): m is OneMMMovement => m !== undefined && strengthTier >= m.minTier);

    // Static and Power rely on total points unlocking, but the tests are universally available if the world is unlocked
    const validPower = powerIds
      .map(id => POWER_MOVEMENTS.find(m => m.id === id))
      .filter((m): m is PowerMovement => m !== undefined && strengthTier >= 6);

    const validStatic = staticIds
      .map(id => STATIC_MOVEMENTS.find(m => m.id === id))
      .filter((m): m is StaticMovement => m !== undefined && strengthTier >= 1);

    return { validOneMm, validPower, validStatic };
  }

  /**
   * The Master Discovery Engine
   */
  static generateRecommendations(
    tag: FocusTag,
    strengthTier: number,
    oneMmPoints: number,
    powerPoints: number,
    staticPoints: number,
    pbsOneMm: Record<string, number>,
    pbsPower: Record<string, number>,
    pbsStatic: Record<string, number>
  ): AssessmentRecommendation[] {
    if (tag === 'NONE') return [];

    const weakestWorld = this.getWeakestWorld(oneMmPoints, powerPoints, staticPoints, strengthTier);
    const { validOneMm, validPower, validStatic } = this.getTestsForTag(tag, strengthTier);
    
    let recommendations: AssessmentRecommendation[] = [];

    // Helper to add a recommendation
    const addRec = (world: World, movement: { id: string, name: string } | undefined, isPriority: boolean, reason?: string, untouched?: boolean) => {
      if (movement) {
        recommendations.push({
          world,
          movementId: movement.id,
          movementName: movement.name,
          isPriority,
          priorityReason: reason,
          isUntouched: untouched
        });
      }
    };

    // 1. Pick the best ONE exercise for each world based on what's unlocked and missing
    // validOneMm/validPower/validStatic preserve getTestsForTag's id-list order,
    // which is hand-authored hardest-to-easiest. Searching from the front with
    // .find() picked the hardest unlocked-but-untouched movement (e.g. Muscle-ups
    // over Inverted Row, since both unlock at the same tier) as the "establish
    // your baseline" suggestion — searching in reverse instead prefers the
    // easiest untouched one, which is what a baseline-establishing test should
    // be. The all-touched fallback (index 0) intentionally keeps wanting the
    // hardest, unchanged.
    // ENDURANCE
    let targetOneMm = [...validOneMm].reverse().find(m => (pbsOneMm[m.id] || 0) === 0);
    const oneMmUntouched = !!targetOneMm;
    if (!targetOneMm) targetOneMm = validOneMm[0]; // default to highest tier unlocked

    // POWER
    let targetPower = [...validPower].reverse().find(m => (pbsPower[m.id] || 0) === 0);
    const powerUntouched = !!targetPower;
    if (!targetPower) targetPower = validPower[0];

    // STATIC
    let targetStatic = [...validStatic].reverse().find(m => (pbsStatic[m.id] || 0) === 0);
    const staticUntouched = !!targetStatic;
    if (!targetStatic) targetStatic = validStatic[0];

    // 2. Identify absolute priority
    // Rule: Untouched test in the Weakest World overrides everything
    let prioritySet = false;

    if (weakestWorld === 'ENDURANCE' && oneMmUntouched) {
      addRec('ENDURANCE', targetOneMm, true, `Your Endurance points are lagging, and you haven't established a baseline for ${targetOneMm?.name} yet.`, true);
      prioritySet = true;
    } else if (weakestWorld === 'POWER' && powerUntouched) {
      addRec('POWER', targetPower, true, `Your Power is lagging, and you haven't established a 1RM for ${targetPower?.name} yet.`, true);
      prioritySet = true;
    } else if (weakestWorld === 'STATIC' && staticUntouched) {
      addRec('STATIC', targetStatic, true, `Your Static holds are lagging. Set your first max hold for ${targetStatic?.name}.`, true);
      prioritySet = true;
    }

    // 3. If no priority was set from untouched weakest world, check other untouched
    if (!prioritySet) {
      if (oneMmUntouched) {
        addRec('ENDURANCE', targetOneMm, true, `You haven't completed the ${targetOneMm?.name} test yet. Establish your baseline!`, true);
        prioritySet = true;
      } else if (powerUntouched) {
        addRec('POWER', targetPower, true, `You haven't completed the ${targetPower?.name} test yet. Establish your baseline!`, true);
        prioritySet = true;
      } else if (staticUntouched) {
        addRec('STATIC', targetStatic, true, `You haven't completed the ${targetStatic?.name} test yet. Establish your baseline!`, true);
        prioritySet = true;
      }
    }

    // 4. If still no priority, default to weakest world
    if (!prioritySet) {
      if (weakestWorld === 'ENDURANCE' && targetOneMm) {
        addRec('ENDURANCE', targetOneMm, true, `Your Endurance points are your weakest link. Push your ${targetOneMm.name} score higher.`);
        prioritySet = true;
      } else if (weakestWorld === 'POWER' && targetPower) {
        addRec('POWER', targetPower, true, `Your Power is your weakest link. Time to increase your ${targetPower.name}.`);
        prioritySet = true;
      } else if (weakestWorld === 'STATIC' && targetStatic) {
        addRec('STATIC', targetStatic, true, `Your Statics are your weakest link. Improve your ${targetStatic.name} hold.`);
        prioritySet = true;
      }
    }

    // 5. Fill out the rest as non-priority options
    if (!recommendations.some(r => r.world === 'ENDURANCE')) addRec('ENDURANCE', targetOneMm, false);
    if (!recommendations.some(r => r.world === 'POWER')) addRec('POWER', targetPower, false);
    if (!recommendations.some(r => r.world === 'STATIC')) addRec('STATIC', targetStatic, false);

    // Sort so priority is first
    return recommendations.sort((a, b) => (a.isPriority === b.isPriority ? 0 : a.isPriority ? -1 : 1));
  }
}
