-- TADA Claims settings, managed from a new admin/owner-only "Settings" modal on /hr/tada:
--
-- tada_vehicle_rates: per-km rates for the Transport fare calculator (Calculate Transport Fare
-- modal). A single rate wasn't enough — a 2-wheeler and 4-wheeler cost genuinely different
-- amounts per km, and EVs run cheaper still, so this is a small keyed rate map rather than one
-- column, e.g. {"2w": 20, "4w": 35, "ev": 15}. Any of the three keys can be null/absent until the
-- client sets it; the calculator prompts to set one rather than assuming a default — no
-- authoritative Nepal government per-km rate exists to hardcode as a fallback.
--
-- tada_purpose_options: preset options for the claim form's Purpose field (now a dropdown +
-- "Other" free-text fallback instead of a bare text input) — same client-editable-list shape as
-- the existing pos_discount_reasons/pos_note_presets.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS tada_vehicle_rates jsonb;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS tada_purpose_options jsonb;

NOTIFY pgrst, 'reload schema';
