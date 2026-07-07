-- Fixes a POS audit finding: KDS tickets never reconciled against the parent order being voided.
-- Nothing previously updated pos_kot_log when an order was voided after its KOT/BOT already
-- printed, so the ticket sat on the Kitchen Display board forever — accumulating "late" alerts
-- for an order that no longer exists, with no signal to kitchen/bar staff that it was cancelled.
--
-- Only 'void' triggers this (see PosOrders.jsx closeOrder), not 'writeoff'/Complimentary — a comp
-- still means the food was actually prepared and served, so its ticket should keep its normal
-- lifecycle; only a genuine void ("this order never should have existed") warrants pulling the
-- ticket. KitchenDisplay.jsx excludes 'cancelled' tickets from its board entirely rather than
-- adding a 4th column, since there's nothing actionable left to do with one.
ALTER TABLE public.pos_kot_log DROP CONSTRAINT pos_kot_log_status_check;
ALTER TABLE public.pos_kot_log ADD CONSTRAINT pos_kot_log_status_check
  CHECK (status = ANY (ARRAY['new'::text, 'in_progress'::text, 'ready'::text, 'cancelled'::text]));

NOTIFY pgrst, 'reload schema';
