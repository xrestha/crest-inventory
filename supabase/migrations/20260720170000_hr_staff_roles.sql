-- HR staff/supervisor/manager role system (S430) — mirrors the IMS staff role system
-- (20260719120000_ims_staff_roles.sql) exactly, but for HR: a real email+password login, distinct
-- from the existing `hr_self_service` PIN portal (an individual employee's own payslip/leave
-- view). This is a genuinely new capability — until now HR was Owner/Admin-only by product intent
-- (Layout.js's `hrVisible` explicitly checked `isAdmin || isOwner`, no role tier at all), found
-- while investigating why a POS Supervisor login saw HR headcount/payroll data on the shared
-- /dashboard (the one place that skipped the same hasImsAccess-style check every IMS page has).
--
-- Same RESTRICTIVE-policy pattern as 20260708130000 (S316) and 20260719120000 (S419): AND with the
-- existing permissive same-client policies, nothing dropped/recreated. Unlike POS/IMS staff (who
-- keep access to their own module's tables plus a few shared ones), an HR staff account has no
-- legitimate reason to touch ANY non-hr_ business table — block the full IMS+POS+shared surface.

ALTER TABLE public.profiles ADD COLUMN hr_role text;
ALTER TABLE public.profiles ADD COLUMN hr_job_title text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_hr_role_check
  CHECK (hr_role = ANY (ARRAY['staff'::text, 'supervisor'::text, 'manager'::text]));

-- One employee can independently hold a POS account, an IMS account, and now an HR-staff account
-- (three separate partial unique indexes on the same column, one per staff-account type) — same
-- pattern as profiles_hr_employee_pos_unique / profiles_hr_employee_ims_unique.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_hr_employee_hr_role_unique
  ON public.profiles (hr_employee_id) WHERE (hr_role IS NOT NULL);

ALTER TABLE public.settings ADD COLUMN hr_custom_roles jsonb DEFAULT '[]'::jsonb;

CREATE FUNCTION public.is_hr_role_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(hr_role IS NOT NULL, false) FROM profiles WHERE id = auth.uid()
$$;

DO $$
DECLARE
  t text;
BEGIN
  -- HR staff accounts: blocked from every IMS table (pure-IMS + the ones POS/IMS staff share,
  -- e.g. recipes/sales_entries/monthly_periods/stock_movements — none of which HR has any use
  -- for) and every pos_*-prefixed business table. Everything NOT in this list (the 20 hr_ tables,
  -- hr_tada_claim_items, settings/clients/feature_flags/profiles/push_subscriptions, audit_logs)
  -- stays reachable, same "what deliberately stays open" set S316 documented.
  FOREACH t IN ARRAY ARRAY[
    'budgets', 'categories', 'closing_stock', 'demand_forecast_daily', 'demand_forecast_run_log',
    'items', 'opening_stock', 'overheads', 'par_levels', 'payable_payments', 'purchase_entries',
    'purchase_order_items', 'purchase_orders', 'requisition_lines', 'requisitions', 'staff_meals',
    'vendor_returns', 'vendors', 'wastages', 'ims_gate_passes',
    'recipes', 'recipe_ingredients', 'recipe_suggestions', 'sales_entries', 'monthly_periods',
    'stock_movements',
    'pos_credit_notes', 'pos_customers', 'pos_guest_order_requests', 'pos_kot_log',
    'pos_order_items', 'pos_order_payments', 'pos_orders', 'pos_parking_slips',
    'pos_payment_confirmations', 'pos_shifts', 'pos_tables'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY no_hr_role_staff ON public.%I AS RESTRICTIVE FOR ALL '
      || 'USING (NOT public.is_hr_role_staff()) WITH CHECK (NOT public.is_hr_role_staff())',
      t);
  END LOOP;
END $$;

-- Defense-in-depth mirror of profiles_ims_role_manager_update — everything in the app actually
-- writes hr_role via the admin-user-ops Edge Function (service role, bypasses RLS), but this
-- covers any future direct-from-frontend write the same way the IMS/POS policies already do.
CREATE POLICY profiles_hr_role_manager_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
    AND (SELECT hr_role FROM profiles WHERE id = auth.uid()) = 'manager'
  )
  WITH CHECK (client_id = (SELECT client_id FROM profiles WHERE id = auth.uid()));

-- get_hr_role_staff_list: structural mirror of get_ims_staff_list.
CREATE FUNCTION public.get_hr_role_staff_list(p_client_id uuid) RETURNS TABLE(
    id uuid, full_name text, email text, hr_role text, hr_job_title text,
    last_seen_at timestamp with time zone, hr_employee_id uuid, employee_code text
) LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_client_id uuid;
  caller_role text;
BEGIN
  SELECT p.client_id, p.role INTO caller_client_id, caller_role
  FROM profiles p WHERE p.id = auth.uid();

  IF caller_role = 'admin' OR caller_client_id = p_client_id THEN
    RETURN QUERY
      SELECT p.id, p.full_name, u.email::text, p.hr_role, p.hr_job_title, p.last_seen_at, p.hr_employee_id, e.employee_code
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN hr_employees e ON e.id = p.hr_employee_id
      WHERE p.client_id = p_client_id
        AND p.role = 'client'
        AND p.hr_role IS NOT NULL
      ORDER BY p.full_name;
  END IF;
END;
$$;

-- REVOKE ... FROM anon alone is a documented no-op here (PUBLIC still holds the grant from the
-- function's own CREATE — see the Postgres PUBLIC-grant/revoke gotcha fixed 2026-07-20 in
-- 20260720150000_fix_ineffective_anon_execute_revokes.sql). Revoke from PUBLIC and grant back
-- explicitly instead, so this one doesn't need a follow-up fix migration like that batch did.
REVOKE EXECUTE ON FUNCTION public.get_hr_role_staff_list(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hr_role_staff_list(uuid) TO authenticated, service_role;

-- get_hr_role_eligible_users: structural mirror of get_ims_eligible_users — only "plain" client-
-- role accounts with none of the four staff-account markers already set are assignable, for the
-- same reason: an account already POS/IMS/self-service is RLS-blocked from hr_ tables regardless
-- of hr_role, so granting it here would look like it worked in the UI while every real read/write
-- still silently failed.
CREATE FUNCTION public.get_hr_role_eligible_users(p_client_id uuid) RETURNS TABLE(
    id uuid, full_name text, email text
) LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_client_id uuid;
  caller_role text;
BEGIN
  SELECT p.client_id, p.role INTO caller_client_id, caller_role
  FROM profiles p WHERE p.id = auth.uid();

  IF caller_role = 'admin' OR caller_client_id = p_client_id THEN
    RETURN QUERY
      SELECT p.id, p.full_name, u.email::text
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.client_id = p_client_id
        AND p.role = 'client'
        AND p.pos_role IS NULL
        AND p.hr_self_service = false
        AND p.ims_role IS NULL
        AND p.hr_role IS NULL
        AND p.id != auth.uid()
      ORDER BY p.full_name;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_hr_role_eligible_users(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hr_role_eligible_users(uuid) TO authenticated, service_role;

-- get_ims_eligible_users must also exclude accounts that already have hr_role set — otherwise,
-- now that hr_role exists, IMS's "Existing User" flow could offer an account that already has an
-- HR-staff login as "eligible," and assigning ims_role to it would look like it worked in the UI
-- while the no_hr_role_staff RESTRICTIVE policy silently blocks every real IMS read/write anyway.
CREATE OR REPLACE FUNCTION public.get_ims_eligible_users(p_client_id uuid) RETURNS TABLE(
    id uuid, full_name text, email text
) LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_client_id uuid;
  caller_role text;
BEGIN
  SELECT p.client_id, p.role INTO caller_client_id, caller_role
  FROM profiles p WHERE p.id = auth.uid();

  IF caller_role = 'admin' OR caller_client_id = p_client_id THEN
    RETURN QUERY
      SELECT p.id, p.full_name, u.email::text
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.client_id = p_client_id
        AND p.role = 'client'
        AND p.pos_role IS NULL
        AND p.hr_self_service = false
        AND p.ims_role IS NULL
        AND p.hr_role IS NULL
        AND p.id != auth.uid()
      ORDER BY p.full_name;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
