-- Plan pricing (Starter/Growth/Pro monthly NPR, shared across IMS/HR/POS) was hardcoded as a
-- PLAN_MRR constant directly in AdminDashboardOverview.jsx — not editable without a code deploy.
-- Stored on the same client_id-NULL global-defaults settings row as app_name/app_tagline etc.,
-- editable via Settings > Plan Pricing (admin-only tab).

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS plan_prices jsonb DEFAULT '{"starter":5000,"growth":8000,"pro":12000}'::jsonb;

NOTIFY pgrst, 'reload schema';
