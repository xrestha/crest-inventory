-- Owner Dashboard Phase 1: `clients.suite_plan` is a new, independent gating axis — the Crest
-- "Suite" bundle tier (IMS+HR+POS bundled at a discount; see SUITE_BUNDLES in
-- src/data/pricingPlans.js, previously marketing-only data with zero backing column) — distinct
-- from the existing per-module plan/hr_plan/pos_plan columns, which only gate individual-module
-- feature tiers. NULL means "not subscribed to Suite at all" — unlike hr_plan/pos_plan there is
-- no free default tier to fall back to.
--
-- feature_flags.owner_dashboard is the admin per-client override — lets one client in below
-- their suite_plan tier, same convention as every other feature's admin-grant-above-plan.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS suite_plan text
  CHECK (suite_plan IN ('starter', 'growth', 'pro'));

ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS owner_dashboard boolean DEFAULT false;

NOTIFY pgrst, 'reload schema';
