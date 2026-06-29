import { supabase } from '../lib/supabase';
import { TournamentLogic } from '../lib/tournamentLogic';

export class TournamentService {
  /**
   * Fetch active session (registration or active)
   */
  static async getActiveSessions() {
    try {
      const { data, error } = await supabase
        .from('tournament_sessions')
        .select('*, config:tournament_configs(*)')
        .in('status', ['registration', 'active'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('TournamentService.getActiveSession failed:', error);
      return null;
    }
  }

  /**
   * Join a tournament session
   */
  static async joinTournament(sessionId: string, userId: string) {
    try {
      // Check if already joined
      const { data: existing } = await supabase
        .from('tournament_participants')
        .select('id')
        .eq('tournament_id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        return { success: true, alreadyJoined: true };
      }

      // Get user's strength tier
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('strength_tier')
        .eq('id', userId)
        .single();

      if (profileErr) throw profileErr;
      const userTier = profile.strength_tier || 0;

      // Check allowed tiers from config
      const { data: session } = await supabase
        .from('tournament_sessions')
        .select('*, config:tournament_configs(*)')
        .eq('id', sessionId)
        .single();

      if (__DEV__) console.log('JOIN VALIDATION:', {
        sessionId,
        userTier,
        allowedTiers: session?.config?.allowed_tiers,
        configExists: !!session?.config
      });

      if (session?.config?.allowed_tiers) {
        const allowed = session.config.allowed_tiers;
        const tierNum = Number(userTier);
        if (!allowed.map(Number).includes(tierNum)) {
          if (__DEV__) console.log('JOIN REJECTED: Tier mismatch');
          throw new Error(`This tournament is not fit for your current tier (T${tierNum}).`);
        }
      }

      // Join
      const { error: joinErr } = await supabase
        .from('tournament_participants')
        .insert({
          tournament_id: sessionId,
          user_id: userId,
          tier_at_start: profile.strength_tier || 0,
        });

      if (joinErr) throw joinErr;

      return { success: true };
    } catch (error) {
      console.error('TournamentService.joinTournament failed:', error);
      return { success: false, error };
    }
  }

  /**
   * Submit score for knockout tournament
   */
  static async submitDailyScore(
    sessionId: string,
    userId: string,
    day: number,
    rawReps: number,
    tier: number,
    strategy: 'best' | 'sum'
  ) {
    try {
      const finalScore = TournamentLogic.calculateFinalScore(rawReps, tier);

      // Fetch participant's current scores
      const { data: participant, error: pErr } = await supabase
        .from('tournament_participants')
        .select('scores')
        .eq('tournament_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (pErr) throw pErr;

      const currentScores = participant.scores || {};
      const currentDayScore = currentScores[day] || { raw: 0, final: 0, trials: 0 };

      let updatedRaw = rawReps;
      let updatedFinal = finalScore;

      if (strategy === 'best') {
        if (finalScore > currentDayScore.final) {
          updatedRaw = rawReps;
          updatedFinal = finalScore;
        } else {
          updatedRaw = currentDayScore.raw;
          updatedFinal = currentDayScore.final;
        }
      } else if (strategy === 'sum') {
        updatedRaw = (currentDayScore.raw || 0) + rawReps;
        updatedFinal = (currentDayScore.final || 0) + finalScore;
      }

      const newScores = {
        ...currentScores,
        [day]: {
          raw: updatedRaw,
          final: updatedFinal,
          trials: (currentDayScore.trials || 0) + 1,
          last_attempt_at: new Date().toISOString()
        }
      };

      const { error: updateErr } = await supabase
        .from('tournament_participants')
        .update({ scores: newScores })
        .eq('tournament_id', sessionId)
        .eq('user_id', userId);

      if (updateErr) throw updateErr;

      // Check if all non-eliminated participants have submitted
      const { data: allParticipants } = await supabase
        .from('tournament_participants')
        .select('user_id, scores, is_eliminated')
        .eq('tournament_id', sessionId);

      const activeParticipants = allParticipants?.filter(p => !p.is_eliminated) || [];
      const allSubmitted = activeParticipants.every(p => p.scores && p.scores[day]);

      if (allSubmitted && activeParticipants.length > 0) {
        // IDEMPOTENCY GUARD: Claim lock to prevent multiple advances
        const { data: lockAcquired } = await supabase.rpc('claim_tournament_advance_lock', { p_session_id: sessionId });

        if (lockAcquired) {
          try {
            if (__DEV__) console.log('AUTO_ADVANCE: day completed =', day, 'advancing to', day + 1);
            await this.advanceToRound(sessionId, day + 1);
          } finally {
            await supabase.rpc('release_tournament_advance_lock', { p_session_id: sessionId });
          }
        }
      }

      return { success: true, finalScore: updatedFinal };
    } catch (error) {
      console.error('TournamentService.submitDailyScore failed:', error);
      return { success: false, error };
    }
  }

  /**
   * Submit score for rank-based tournament
   */
  static async submitRankBasedScore(sessionId: string, userId: string, rawReps: number, tier: number) {
    try {
      const { data: session, error: sErr } = await supabase
        .from('tournament_sessions')
        .select('*, config:tournament_configs(*)')
        .eq('id', sessionId)
        .single();

      if (sErr) throw sErr;
      const config = session.config;

      const { data: participant, error: pErr } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('tournament_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (pErr) throw pErr;

      // Cooldown check
      if (participant.last_trial_at && config.cooldown_min) {
        const lastTrial = new Date(participant.last_trial_at).getTime();
        const now = new Date().getTime();
        const cooldownMs = config.cooldown_min * 60 * 1000;
        if (now - lastTrial < cooldownMs) {
          return { blocked: true, remainingMs: cooldownMs - (now - lastTrial) };
        }
      }

      // Trials check
      if (config.max_trials && participant.trials_used >= config.max_trials) {
        return { exhausted: true };
      }

      const finalScore = rawReps; // Rank-based scores are already calculated

      const { error: updateErr } = await supabase
        .from('tournament_participants')
        .update({
          total_score: (participant.total_score || 0) + finalScore,
          trials_used: (participant.trials_used || 0) + 1,
          last_trial_at: new Date().toISOString()
        })
        .eq('id', participant.id);

      if (updateErr) throw updateErr;
      
      // Check if all participants have exhausted their trials
      const { data: allParticipants } = await supabase
        .from('tournament_participants')
        .select('trials_used')
        .eq('tournament_id', sessionId);

      const allExhausted = allParticipants?.every(
        p => p.trials_used >= (config.max_trials || 999)
      );

      if (__DEV__) console.log('TRIALS_CHECK: allExhausted =', allExhausted, 'trials_used =', participant.trials_used + 1, 'max =', config.max_trials);
      if (allExhausted && allParticipants && allParticipants.length > 0) {
        // IDEMPOTENCY GUARD: Claim lock to prevent multiple closures
        const { data: lockAcquired } = await supabase.rpc('claim_tournament_advance_lock', { p_session_id: sessionId });

        if (lockAcquired) {
          try {
            if (__DEV__) console.log('AUTO_CLOSING rank-based tournament');
            await this.closeRankBasedTournament(sessionId);
          } finally {
            await supabase.rpc('release_tournament_advance_lock', { p_session_id: sessionId });
          }
        }
      }

      return {
        success: true,
        finalScore,
        trialsRemaining: config.max_trials ? config.max_trials - (participant.trials_used + 1) : null
      };
    } catch (error) {
      console.error('TournamentService.submitRankBasedScore failed:', error);
      return { success: false, error };
    }
  }

  /**
   * Advance to the next round (Knockout)
   */
  static async advanceToRound(sessionId: string, nextRound: number) {
    try {
      const { data: session, error: sErr } = await supabase
        .from('tournament_sessions')
        .select('*, config:tournament_configs(*)')
        .eq('id', sessionId)
        .single();

      if (sErr) throw sErr;

      const { data: participants, error: pErr } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('tournament_id', sessionId);

      if (pErr) throw pErr;

      let survivors: string[] = [];

      if (nextRound === 1) {
        survivors = (Array.isArray(participants) ? participants : []).map(p => p.user_id);
      } else {
        // Get matches from previous round
        const { data: matches } = await supabase
          .from('tournament_matches')
          .select('*')
          .eq('tournament_id', sessionId)
          .eq('day', nextRound - 1);

        if (matches) {
          for (const match of matches) {
            const winnerId = await this.determineMatchWinner(match);
            if (winnerId) survivors.push(winnerId);
          }
        }

        // Mark non-survivors as eliminated. The RPC derives losers from
        // tournament_matches.winner_id for this round itself rather than
        // trusting a client-supplied survivor list.
        const { error: elimErr } = await supabase.rpc('eliminate_tournament_match_losers', {
          p_session_id: sessionId,
          p_round: nextRound - 1,
        });
        if (elimErr) throw elimErr;
      }

      // Check for winner
      if (__DEV__) console.log('ADVANCE: survivors =', survivors.length, 'nextRound =', nextRound);
      if (survivors.length === 1 && nextRound > 1) {
        if (__DEV__) console.log('CALLING handleTournamentEnd for', survivors[0]);
        await this.handleTournamentEnd(sessionId, survivors[0]);
        return;
      }

      // Advance session
      const deadline = new Date();
      deadline.setMinutes(deadline.getMinutes() + (session.config.window_time_min || 0));

      const { error: updErr } = await supabase
        .from('tournament_sessions')
        .update({
          status: 'active',
          current_round: nextRound,
          round_deadline: deadline.toISOString()
        })
        .eq('id', sessionId);
      if (updErr) throw updErr;

      // Create pairings
      const shuffled = survivors.sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffled.length; i += 2) {
        const userA = shuffled[i];
        const userB = shuffled[i + 1] || null;
        const { error: insErr } = await supabase
          .from('tournament_matches')
          .insert({
            tournament_id: sessionId,
            day: nextRound,
            user_a: userA,
            user_b: userB,
            is_ghost_match: userB === null
          });
        if (insErr) throw insErr;
      }
    } catch (error) {
      console.error('TournamentService.advanceToRound failed:', error);
    }
  }

  /**
   * Determine the winner of a match
   */
  static async determineMatchWinner(match: any) {
    try {
      const { data: participantA } = await supabase
        .from('tournament_participants')
        .select('scores')
        .eq('tournament_id', match.tournament_id)
        .eq('user_id', match.user_a)
        .single();

      const scoreA = participantA?.scores?.[match.day]?.final || 0;

      const { data: session } = await supabase
        .from('tournament_sessions')
        .select('*, config:tournament_configs(*)')
        .eq('id', match.tournament_id)
        .single();

      const roundConfig = session?.config?.workout_config?.find((c: any) => c.day === match.day);
      const isForTime = roundConfig?.mode === 'for_time';

      let winnerId = null;

      if (match.is_ghost_match) {
        const median = await this.getLiveMedian(match.tournament_id, match.day);
        if (isForTime) {
          if (scoreA > 0 && scoreA <= median) winnerId = match.user_a;
        } else {
          if (scoreA >= median) {
            winnerId = match.user_a;
          }
        }
      } else {
        const { data: participantB } = await supabase
          .from('tournament_participants')
          .select('scores')
          .eq('tournament_id', match.tournament_id)
          .eq('user_id', match.user_b)
          .single();

        const scoreB = participantB?.scores?.[match.day]?.final || 0;
        
        if (isForTime) {
          // Lower score = faster = winner. Score of 0 means not submitted.
          if (scoreA === 0 && scoreB === 0) winnerId = match.user_a;
          else if (scoreA === 0) winnerId = match.user_b;
          else if (scoreB === 0) winnerId = match.user_a;
          else if (scoreA === scoreB) {
            // Tiebreaker: Earlier submission wins
            const timeA = participantA?.scores?.[match.day]?.last_attempt_at ? new Date(participantA.scores[match.day].last_attempt_at).getTime() : Date.now();
            const timeB = participantB?.scores?.[match.day]?.last_attempt_at ? new Date(participantB.scores[match.day].last_attempt_at).getTime() : Date.now();
            winnerId = timeA <= timeB ? match.user_a : match.user_b;
          }
          else winnerId = scoreA < scoreB ? match.user_a : match.user_b;
        } else {
          if (scoreA === scoreB && scoreA > 0) {
            // Tiebreaker: Earlier submission wins
            const timeA = participantA?.scores?.[match.day]?.last_attempt_at ? new Date(participantA.scores[match.day].last_attempt_at).getTime() : Date.now();
            const timeB = participantB?.scores?.[match.day]?.last_attempt_at ? new Date(participantB.scores[match.day].last_attempt_at).getTime() : Date.now();
            winnerId = timeA <= timeB ? match.user_a : match.user_b;
          } else {
            winnerId = scoreA >= scoreB ? match.user_a : match.user_b;
          }
        }
      }

      if (winnerId) {
        const { error: updErr } = await supabase
          .from('tournament_matches')
          .update({ winner_id: winnerId })
          .eq('id', match.id);
        if (updErr) throw updErr;
      }

      return winnerId;
    } catch (error) {
      console.error('TournamentService.determineMatchWinner failed:', error);
      return null;
    }
  }

  /**
   * Calculate median score for ghost match evaluation
   */
  static async getLiveMedian(tournamentId: string, day: number) {
    try {
      const { data: participants } = await supabase
        .from('tournament_participants')
        .select('scores')
        .eq('tournament_id', tournamentId);

      if (!participants) return 0;

      const scores = (Array.isArray(participants) ? participants : [])
        .map(p => p.scores?.[day]?.final)
        .filter(s => s !== undefined && s > 0)
        .sort((a, b) => a - b);

      if (scores.length === 0) return 0;

      const mid = Math.floor(scores.length / 2);
      if (scores.length % 2 === 0) {
        return (scores[mid - 1] + scores[mid]) / 2;
      } else {
        return scores[mid];
      }
    } catch (error) {
      console.error('TournamentService.getLiveMedian failed:', error);
      return 0;
    }
  }

  /**
   * Handle end of tournament and award prizes. Ranking, final_rank
   * assignment, and payout are all computed server-side in
   * conclude_knockout_tournament (idempotent, rank-consistent) rather than
   * via direct client writes to other participants' rows.
   */
  static async handleTournamentEnd(sessionId: string, winnerId: string) {
    try {
      const { error } = await supabase.rpc('conclude_knockout_tournament', {
        p_session_id: sessionId,
        p_winner_user_id: winnerId,
      });
      if (error) throw error;
    } catch (error) {
      console.error('TournamentService.handleTournamentEnd failed:', error);
    }
  }

  /**
   * Auto-eliminate participants who missed the deadline. The RPC
   * re-verifies the deadline and derives non-submitters server-side rather
   * than trusting the client's read of round_deadline/current_round.
   */
  static async checkAndAutoEliminate(sessionId: string) {
    try {
      const { data: session } = await supabase
        .from('tournament_sessions')
        .select('round_deadline, current_round')
        .eq('id', sessionId)
        .single();

      if (!session || !session.round_deadline) return;

      if (new Date() > new Date(session.round_deadline)) {
        const { data: eliminatedCount, error: elimErr } = await supabase.rpc('auto_eliminate_non_submitters', {
          p_session_id: sessionId,
        });
        if (elimErr) throw elimErr;

        if ((eliminatedCount || 0) > 0) {
          await this.advanceToRound(sessionId, session.current_round + 1);
        }
      }
    } catch (error) {
      console.error('TournamentService.checkAndAutoEliminate failed:', error);
    }
  }

  /**
   * Periodically called to ensure tournaments don't hang past their deadline
   */
  static async checkTournamentExpiry(sessionId: string) {
    try {
      const { data: session } = await supabase
        .from('tournament_sessions')
        .select('round_deadline, status, current_round, config:tournament_configs(type)')
        .eq('id', sessionId)
        .single();

      if (!session || session.status !== 'active' || !session.round_deadline) return;

      if (new Date() > new Date(session.round_deadline)) {
        if (__DEV__) console.log('EXPIRY: Deadline passed for session', sessionId);
        const configType = (session.config as any)?.type;
        if (configType === 'knockout') {
          await this.checkAndAutoEliminate(sessionId);
        } else {
          await this.closeRankBasedTournament(sessionId);
        }
      }
    } catch (error) {
      console.error('TournamentService.checkTournamentExpiry failed:', error);
    }
  }

  /**
   * Close rank-based tournament and award prizes. Ranking (by total_score,
   * tiebreak by earlier last_trial_at), final_rank assignment, and payout
   * are all computed server-side in conclude_rank_based_tournament
   * (idempotent via a row lock + status check) rather than via direct
   * client writes to other participants' rows.
   */
  static async closeRankBasedTournament(sessionId: string) {
    try {
      const { error } = await supabase.rpc('conclude_rank_based_tournament', {
        p_session_id: sessionId,
      });
      if (error) throw error;
    } catch (error) {
      console.error('TournamentService.closeRankBasedTournament failed:', error);
    }
  }
}
