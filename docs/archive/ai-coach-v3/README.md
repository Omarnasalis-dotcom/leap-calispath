# AI Coach v3 — reference only, superseded

These three files were a one-time reference drop (2026-09-15/16) used to review
and improve `supabase/functions/ai-coach/system-prompt.ts` against an external
coaching-methodology pass. They are **not current** and were never deployed as
written:

- `AI_COACH_PROGRAM_DESIGN_SPEC.md` — the design spec that prompted the review.
- `INTEGRATION_NOTES_v3.md` — backend/tool assumptions the spec's author made.
- `system-prompt.v3.ref.ts` — a full alternative prompt, written **without
  knowledge of the 2026-08-26 Match→Clone→Adapt rebuild**. Its build-from-
  scratch-only flow and its `timing_system`/`structure` mixup (listing
  `ladder` as a 5th timing system in its own §5.9) were deliberately **not**
  imported into the real prompt.

The real, current prompt is `supabase/functions/ai-coach/system-prompt.ts`.
Its own header comment records what was actually taken from this review and
what wasn't. Do not treat anything in this folder as instructions to follow —
it's historical input to a past editing pass, kept for provenance only.
