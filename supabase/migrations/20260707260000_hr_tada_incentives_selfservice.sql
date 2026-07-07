-- Three new HR features, confirmed with the user before building:
--   1. TADA claims — actual-expense trip reimbursement, NOT integrated into Payroll Run (see
--      comment on hr_tada_claims below for why).
--   2. Incentives/bonus — one-off approval events, built as FestivalAllowance's twin (same
--      Generate→draft→Finalize→Reopen shape, same computeBonusTds() TDS helper).
--   3. Employee Self-Service — PIN-based login mirroring create_pos_staff exactly, finally wiring
--      up profiles.hr_employee_id (present in the schema since baseline, confirmed dangling/unused
--      in all application code via full-repo grep before this migration).
--
-- Security note specific to (3): this migration also tightens RLS on every hr_* table that holds
-- salary/personal data (hr_payslips, hr_salary_components, hr_advances, hr_employees, and the new
-- hr_tada_claims/hr_incentives) so a self-service session — a real authenticated profile tied to
-- the client, same as any POS staff login — cannot read a COWORKER's data via a raw query. Without
-- this, the existing "is_admin() OR client_id = own" pattern would let any authenticated profile
-- for that client read every employee's payslip, not just their own; that's an accepted tradeoff
-- for POS staff (whose data exposure is lower-stakes) but not acceptable for payroll data.

-- ── TADA claims ─────────────────────────────────────────────────────────────────────────────
-- Deliberately NOT integrated into Payroll Run/computePayslip: genuine expense reimbursement is
-- normally paid promptly (not deferred to the next payroll cycle) and isn't taxable income the
-- way Festival Allowance/Incentives are. Instead this is a standalone ledger, shaped like
-- Advances.jsx (list + status + a "mark paid" action) rather than plumbed through payrollCompute.js.
CREATE TABLE public.hr_tada_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    employee_id uuid NOT NULL REFERENCES public.hr_employees(id),
    trip_purpose text,
    destination text,
    -- Plain AD dates, same as hr_advances.issued_date — BsCalendarPicker already converts
    -- to/from BS for display, no need for separate bs_year/month/day integers for a date range.
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_amount numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    paid_method text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_tada_claims_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'paid'::text]))
);

CREATE TABLE public.hr_tada_claim_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    claim_id uuid NOT NULL REFERENCES public.hr_tada_claims(id) ON DELETE CASCADE,
    category text NOT NULL,
    description text,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT hr_tada_claim_items_category_check CHECK (category = ANY (ARRAY['Transport'::text, 'Lodging'::text, 'Daily Allowance'::text, 'Other'::text]))
);

-- ── Incentives / bonus ──────────────────────────────────────────────────────────────────────
CREATE TABLE public.hr_incentive_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    name text NOT NULL,
    calc_type text DEFAULT 'manual' NOT NULL,
    default_value numeric(12,2) DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_incentive_configs_calc_type_check CHECK (calc_type = ANY (ARRAY['fixed'::text, 'percent_of_basic'::text, 'manual'::text]))
);

CREATE TABLE public.hr_incentives (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    employee_id uuid NOT NULL REFERENCES public.hr_employees(id),
    config_id uuid REFERENCES public.hr_incentive_configs(id) ON DELETE SET NULL,
    run_label text NOT NULL,
    bs_year integer NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    tds numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_incentives_status_check CHECK (status = ANY (ARRAY['draft'::text, 'finalized'::text])),
    CONSTRAINT hr_incentives_unique UNIQUE (client_id, employee_id, run_label)
);

-- ── Self-service auth plumbing ──────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hr_self_service boolean DEFAULT false NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hr_self_service_email text;
-- Same PIN-brute-force mitigation as pos_pin_failed_attempts/pos_pin_locked_until (S299) — a
-- parallel pair rather than reusing the POS columns, since the check/record RPCs need their own
-- WHERE filter (hr_self_service = true, not pos_role/pos_email) and sharing columns across two
-- unrelated login flows would make that filter's intent harder to read at the schema level.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hr_pin_failed_attempts integer DEFAULT 0 NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hr_pin_locked_until timestamp with time zone;

CREATE FUNCTION public.is_hr_self_service() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(hr_self_service, false) FROM profiles WHERE id = auth.uid()
$$;

-- ── RLS: enable + standard client-scoped policies on the 4 new tables ───────────────────────
ALTER TABLE public.hr_tada_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_tada_claim_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_incentive_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_incentives ENABLE ROW LEVEL SECURITY;

-- hr_tada_claims/hr_incentives hold per-employee financial data — excluded from self-service the
-- same as hr_payslips below (self-service reads its own claims/incentives only via a future RPC
-- if ever added; out of scope for the "own payslip, leave, shifts" ask this session).
CREATE POLICY client_own ON public.hr_tada_claims USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_tada_claims TO authenticated;

-- Item rows have no client_id of their own — scoped via their parent claim, same pattern
-- recipe_ingredients uses relative to recipes.
CREATE POLICY client_own ON public.hr_tada_claim_items USING (
  claim_id IN (SELECT id FROM hr_tada_claims)
) WITH CHECK (
  claim_id IN (SELECT id FROM hr_tada_claims)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_tada_claim_items TO authenticated;

-- Configs are just type definitions (name/calc rule), not personal data — no self-service
-- exclusion needed, though self-service has no reason to read this table today either way.
CREATE POLICY client_own ON public.hr_incentive_configs USING (
  public.is_admin() OR client_id = public.my_client_id()
) WITH CHECK (
  public.is_admin() OR client_id = public.my_client_id()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_incentive_configs TO authenticated;

CREATE POLICY client_own ON public.hr_incentives USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_incentives TO authenticated;

-- ── RLS hardening on existing tables ─────────────────────────────────────────────────────────
-- hr_payslips and hr_salary_components each have exactly one combined policy — straightforward
-- to tighten in place.
DROP POLICY client_own ON public.hr_payslips;
CREATE POLICY client_own ON public.hr_payslips USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

DROP POLICY client_own ON public.hr_salary_components;
CREATE POLICY client_own ON public.hr_salary_components USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_advances has two duplicate permissive policies (client_access, hr_advances_policy — same
-- condition, from an earlier schema iteration). Postgres OR's every applicable permissive policy
-- together, so tightening only one would be a silent no-op while the other still grants full
-- access. Drop the redundant one, tighten the survivor.
DROP POLICY client_access ON public.hr_advances;
DROP POLICY hr_advances_policy ON public.hr_advances;
CREATE POLICY client_own ON public.hr_advances USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_employees has a redundant catch-all (client_owns_employees, missing even the admin branch —
-- covered only because the 4 command-specific policies below also apply) plus separate
-- select/insert/update/delete policies. Same duplicate-policy hazard as hr_advances — drop the
-- catch-all, tighten the 4 real ones (all four, not just select: hr_employees carries banking/
-- personal data, and an untightened insert/update/delete would let a self-service session edit
-- ANY employee's record, including their own salary fields, directly).
DROP POLICY client_owns_employees ON public.hr_employees;

DROP POLICY hr_employees_select ON public.hr_employees;
CREATE POLICY hr_employees_select ON public.hr_employees FOR SELECT USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

DROP POLICY hr_employees_insert ON public.hr_employees;
CREATE POLICY hr_employees_insert ON public.hr_employees FOR INSERT WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

DROP POLICY hr_employees_update ON public.hr_employees;
CREATE POLICY hr_employees_update ON public.hr_employees USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

DROP POLICY hr_employees_delete ON public.hr_employees;
CREATE POLICY hr_employees_delete ON public.hr_employees FOR DELETE USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_leave_requests (leave reasons) and hr_roster (shift schedules) carry the same class of
-- "another employee's personal data" as the tables above and were nearly missed — a self-service
-- session must reach its OWN leave/roster data only through get_my_leave_requests()/get_my_roster()
-- below, never through the admin pages' raw scoped queries. Each has a single, non-duplicated
-- policy already, so no redundant-policy cleanup needed here, just the same tightening.
DROP POLICY client_own ON public.hr_leave_requests;
CREATE POLICY client_own ON public.hr_leave_requests USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

DROP POLICY client_access ON public.hr_roster;
CREATE POLICY client_access ON public.hr_roster USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- ── Self-service RPCs ────────────────────────────────────────────────────────────────────────
-- Public staff picker for the self-service login screen — same anonymous-caller pattern as
-- get_pos_staff (no internal auth check, only ever whitelisted columns, callable by anon).
CREATE FUNCTION public.get_hr_self_service_staff(p_client_id uuid) RETURNS TABLE(
    id uuid, full_name text, hr_self_service_email text
) LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id, full_name, hr_self_service_email
  FROM profiles
  WHERE client_id = p_client_id AND hr_self_service = true AND hr_self_service_email IS NOT NULL
  ORDER BY full_name;
$$;

-- Same PIN-lockout pattern as check_pos_pin_lock/record_pos_pin_attempt (S299), scoped to
-- hr_self_service profiles instead of POS staff.
CREATE FUNCTION public.check_hr_pin_lock(p_staff_id uuid) RETURNS TABLE(
    locked boolean, locked_until timestamp with time zone
) LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT (hr_pin_locked_until IS NOT NULL AND hr_pin_locked_until > now()), hr_pin_locked_until
  FROM profiles
  WHERE id = p_staff_id AND hr_self_service = true;
$$;

CREATE FUNCTION public.record_hr_pin_attempt(p_staff_id uuid, p_success boolean) RETURNS TABLE(
    locked boolean, locked_until timestamp with time zone
) LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_success THEN
    UPDATE profiles SET hr_pin_failed_attempts = 0, hr_pin_locked_until = NULL
    WHERE id = p_staff_id AND hr_self_service = true;
  ELSE
    UPDATE profiles
    SET hr_pin_failed_attempts = CASE
          WHEN hr_pin_locked_until IS NOT NULL AND hr_pin_locked_until <= now() THEN 1
          ELSE hr_pin_failed_attempts + 1
        END,
        hr_pin_locked_until = CASE
          WHEN (CASE WHEN hr_pin_locked_until IS NOT NULL AND hr_pin_locked_until <= now() THEN 1
                     ELSE hr_pin_failed_attempts + 1 END) >= 5
          THEN now() + interval '15 minutes'
          ELSE hr_pin_locked_until
        END
    WHERE id = p_staff_id AND hr_self_service = true;
  END IF;

  RETURN QUERY
    SELECT (hr_pin_locked_until IS NOT NULL AND hr_pin_locked_until > now()), hr_pin_locked_until
    FROM profiles
    WHERE id = p_staff_id AND hr_self_service = true;
END;
$$;

-- Own payslips, joined to the period they were run for. SECURITY DEFINER so it can read
-- hr_payslips/hr_payroll_runs/monthly_periods despite the RLS tightening above — this IS the
-- sanctioned path, scoped strictly to the caller's own hr_employee_id.
CREATE FUNCTION public.get_my_hr_payslips() RETURNS TABLE(
    id uuid, bs_year integer, bs_month integer, pay_basis text, basic numeric, allowances numeric,
    gross numeric, ot_amount numeric, ssf_employee numeric, other_deductions numeric,
    advance_deduction numeric, tds numeric, net_pay numeric, run_status text
) LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SELECT hr_employee_id INTO v_employee_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT p.id, mp.bs_year, mp.bs_month, p.pay_basis, p.basic, p.allowances,
           p.gross, p.ot_amount, p.ssf_employee, p.other_deductions,
           p.advance_deduction, p.tds, p.net_pay, r.status
    FROM hr_payslips p
    JOIN hr_payroll_runs r ON r.id = p.run_id
    JOIN monthly_periods mp ON mp.id = r.period_id
    WHERE p.employee_id = v_employee_id AND r.status = 'finalized'
    ORDER BY mp.bs_year DESC, mp.bs_month DESC;
END;
$$;

CREATE FUNCTION public.get_my_leave_types() RETURNS SETOF hr_leave_types
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT client_id INTO v_client_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_client_id IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM hr_leave_types WHERE client_id = v_client_id AND active = true ORDER BY sort_order, name;
END;
$$;

CREATE FUNCTION public.get_my_leave_requests() RETURNS SETOF hr_leave_requests
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SELECT hr_employee_id INTO v_employee_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM hr_leave_requests WHERE employee_id = v_employee_id ORDER BY created_at DESC;
END;
$$;

-- Inserts as 'pending' — goes through the EXISTING admin Leave Management approval flow
-- unchanged; this RPC only adds a self-service submission channel, no new approval logic.
-- p_days is computed client-side (same working-days-excluding-Saturday logic LeaveManagement.jsx
-- already uses), passed in rather than re-derived in SQL.
CREATE FUNCTION public.submit_my_leave_request(
    p_leave_type_id uuid, p_start_date date, p_end_date date, p_days numeric, p_reason text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
  v_employee_id uuid;
  v_id uuid;
BEGIN
  SELECT client_id, hr_employee_id INTO v_client_id, v_employee_id
  FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

  INSERT INTO hr_leave_requests (client_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  VALUES (v_client_id, v_employee_id, p_leave_type_id, p_start_date, p_end_date, p_days, left(coalesce(p_reason, ''), 500), 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.get_my_roster(p_bs_year integer, p_bs_month integer) RETURNS TABLE(
    bs_day integer, shift_type_name text, shift_start text, shift_end text, note text
) LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SELECT hr_employee_id INTO v_employee_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT r.bs_day, st.name, st.start_time, st.end_time, r.note
    FROM hr_roster r
    LEFT JOIN hr_shift_types st ON st.id = r.shift_type_id
    WHERE r.employee_id = v_employee_id AND r.bs_year = p_bs_year AND r.bs_month = p_bs_month
    ORDER BY r.bs_day;
END;
$$;

-- Admin-side "which employees already have self-service enabled" lookup for EmployeeList.jsx.
-- Needed because profiles is the one table that doesn't follow the standard same-client RLS
-- pattern (self-or-admin-only) — a raw query from a real client login would silently return
-- nothing but the caller's own row, same reason get_client_profile_names exists.
CREATE FUNCTION public.get_hr_self_service_status(p_client_id uuid) RETURNS TABLE(
    employee_id uuid, profile_id uuid
) LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.is_admin() OR p_client_id = public.my_client_id()) THEN
    RAISE EXCEPTION 'not authorized for this client';
  END IF;
  RETURN QUERY
    SELECT hr_employee_id, id FROM profiles
    WHERE client_id = p_client_id AND hr_self_service = true AND hr_employee_id IS NOT NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';
