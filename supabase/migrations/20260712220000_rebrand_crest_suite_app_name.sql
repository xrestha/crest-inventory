-- Rebrand: "Crest Inventory" -> "Crest Suite" (app-wide, 2026-07-12).
-- Updates the settings.app_name column default for new rows, plus the global-defaults row
-- (client_id IS NULL) and any client row still on the untouched literal old default. Does NOT
-- touch a row where a client/admin has set their own custom app_name (e.g. "Casa Acai Cafe") --
-- that's their branding, not this product's name.
ALTER TABLE public.settings ALTER COLUMN app_name SET DEFAULT 'Crest Suite';

UPDATE public.settings
SET app_name = 'Crest Suite'
WHERE app_name = 'Crest Inventory';
