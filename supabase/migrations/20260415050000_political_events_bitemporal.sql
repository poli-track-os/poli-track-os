-- Add bitemporal + LLM-extraction columns to political_events.
--
-- valid_from / valid_to:  when the event was TRUE in the world.
-- event_timestamp is kept as the canonical "when it happened" but we now
-- also track valid windows separately for events that span time (e.g. a
-- committee membership is a valid window, not a point).
--
-- extraction_model / extraction_confidence: populated when an event was
-- derived by the LLM extraction pipeline (Phase 4).

ALTER TABLE public.political_events
  ADD COLUMN IF NOT EXISTS valid_from timestamptz,
  ADD COLUMN IF NOT EXISTS valid_to   timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_model      text,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric
    CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1));

-- Backfill valid_from from event_timestamp for existing rows.
UPDATE public.political_events
   SET valid_from = event_timestamp
 WHERE valid_from IS NULL;

CREATE INDEX IF NOT EXISTS political_events_valid_from_idx ON public.political_events (valid_from);
