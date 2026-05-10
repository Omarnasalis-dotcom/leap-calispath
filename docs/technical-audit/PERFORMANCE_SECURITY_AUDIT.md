# Performance & Security Audit

A technical evaluation of the Anti-Gravity project's robustness, speed, and safety.

## 1. Security Analysis

### ✅ Strengths
- **Supabase Auth**: Leveraging industry-standard JWT-based authentication.
- **Row Level Security (RLS)**: Core data (profiles, holds) is protected at the database level.
- **Atomic RPCs**: Critical competitive logic is moved to server-side plpgsql functions to prevent "client-side spoofing" of winners and scores.
- **`SECURITY DEFINER` Usage**: Prevents direct REST API manipulation of sensitive fields like `glory_score` or `winner_id`.

### ⚠️ Vulnerabilities & Risks
- **Client-Side Anti-Cheat**: The `isTimeValid` check in `TrialService` can be bypassed by anyone calling the Supabase RPCs/REST directly (e.g., via Postman). 
    - **Fix**: Move time validation into the Postgres function or a Supabase Edge Function.
- **Exposed API Key**: The `SUPABASE_ANON_KEY` is public in the frontend (standard for Supabase, but requires airtight RLS to be safe).
- **No Rate Limiting**: There is currently no server-side rate limiting on sending Clash challenges or posting scores, which could lead to spam.

## 2. Performance Audit

### ✅ Strengths
- **Real-time CDC**: Using Postgres CDC instead of polling reduces battery drain and data usage on mobile devices.
- **JSONB Optimization**: Storing scores and PBs in JSONB reduces the number of joins needed to render the complex `ProfileScreen`.
- **View-Based Leaderboards**: Using Postgres Views for leaderboards ensures complex sorting and filtering happens on the server.

### ⚠️ Potential Bottlenecks
- **Expensive Leaderboard Aggregations**: The `get_static_well_rounded_leaderboard` RPC performs multiple subqueries. As the user base reaches 10k+, this will become slow.
    - **Fix**: Materialized views with periodic refreshes.
- **N+1 Query Risks**: Some screens (like `ClashScreen`) might perform multiple separate calls to fetch profiles of the two participants.
    - **Fix**: Use `.select('*, sender:profiles(*), receiver:profiles(*)')` to fetch everything in one join.
- **Bundle Size**: Extensive use of `@expo/vector-icons` and multiple large libraries might impact initial load time on low-end devices.

## 3. Scalability Roadmap
1. **Tier 1 (Current)**: Direct SQL execution. Efficient for <5,000 active users.
2. **Tier 2 (Growth)**: Implementation of Redis/Caching layer for leaderboard data to reduce DB load.
3. **Tier 3 (Enterprise)**: Move complex workout generation and anti-cheat to decentralized Edge Functions (Deno) to minimize latency globally.

## 4. Trust Analysis
- **System Integrity**: High. The use of SUDDEN DEATH logic and atomic DB updates makes it very hard to "fake" a win in real-time.
- **Data Privacy**: Moderate. Currently, all profiles are public by default. Implementing a "Private Profile" toggle that filters users out of the `public_leaderboard` view is recommended.
