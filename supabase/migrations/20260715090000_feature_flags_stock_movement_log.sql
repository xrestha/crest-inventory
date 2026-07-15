-- New "Stock Movements" report page (per-period ledger view of stock_movements, the POS
-- stock-depletion table that previously had no dedicated UI — only ReorderReport.js's "Book
-- Stock" column read it). feature_flags is a wide table (one boolean column per feature key),
-- so a new feature key needs its own column here before FeatureAccessModal.js can toggle it.

ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS stock_movement_log boolean DEFAULT false;

NOTIFY pgrst, 'reload schema';
