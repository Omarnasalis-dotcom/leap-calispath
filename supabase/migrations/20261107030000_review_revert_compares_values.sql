-- Found on TestFlight 2026-11-07: a review set an exercise weighted, then
-- changed the same block's time cap. Revert undid the cap first, which rewrites
-- the block's notes as jsonb text, with different spacing from what the AI
-- Coach stored. The fingerprint hashed the notes as text, so the weighted edit
-- looked "changed since" and was skipped. Compare the settings and the note,
-- not how they were spelled.

CREATE OR REPLACE FUNCTION public._block_fingerprint(p_full jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5((
    (p_full - 'order_index' - 'notes')
    || jsonb_build_object(
      'settings', public._block_concept(p_full->>'notes'),
      'note', ltrim(regexp_replace(COALESCE(p_full->>'notes', ''), '^\[CONCEPT:.*?\]', ''))
    )
  )::text);
$$;
