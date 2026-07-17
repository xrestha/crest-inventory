-- Kitchen/bar staff enter a probable prep time (minutes) when they tap "Start" on a KOT/BOT
-- ticket in the Kitchen Display (src/modules/pos/kds/KitchenDisplay.jsx). Alongside the existing
-- started_at/ready_at timestamps this makes estimated-vs-actual prep time reportable, and lets
-- front-of-house see an ETA on the floor view (PosOrders.jsx).
ALTER TABLE public.pos_kot_log
  ADD COLUMN estimated_prep_minutes integer,
  ADD CONSTRAINT pos_kot_log_estimated_prep_minutes_check
    CHECK (estimated_prep_minutes IS NULL OR estimated_prep_minutes > 0);
