// Temporary in-memory store for tournament data between screens
let _roundConfig: any = null;
let _sessionId: string | null = null;

export const TournamentStore = {
  setRoundConfig: (sessionId: string, roundConfig: any) => {
    _sessionId = sessionId;
    _roundConfig = roundConfig;
  },
  getRoundConfig: () => _roundConfig,
  getSessionId: () => _sessionId,
  clear: () => {
    _roundConfig = null;
    _sessionId = null;
  },
};
