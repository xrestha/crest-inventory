-- monthly_periods had no constraint preventing two 'open' periods for the same client — unlike
-- pos_shifts, which already learned this lesson (pos_shifts_one_open_per_client). Virtually every
-- IMS/HR/Owner Dashboard page assumes "at most one open period" via a plain
-- .eq('status','open').limit(1).single() read; if that invariant were ever violated (a bug
-- elsewhere, a race between two admin sessions, manual DB editing), every one of those reads
-- would silently pick an arbitrary one of the open periods with no indication anything was wrong
-- — .single() can't even detect the conflict, since the .limit(1) ahead of it already discards
-- the extra row before .single() ever sees it.

-- Defensive dedup first (should be a no-op in practice) — close all but the most recently opened
-- period per client, so the constraint below is safe to add regardless of current data state.
WITH ranked AS (
  SELECT id, client_id,
         row_number() OVER (PARTITION BY client_id ORDER BY bs_year DESC, bs_month DESC, created_at DESC) AS rn
  FROM public.monthly_periods
  WHERE status = 'open'
)
UPDATE public.monthly_periods mp
SET status = 'closed'
FROM ranked r
WHERE mp.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS monthly_periods_one_open_per_client
  ON public.monthly_periods (client_id) WHERE status = 'open';

NOTIFY pgrst, 'reload schema';
