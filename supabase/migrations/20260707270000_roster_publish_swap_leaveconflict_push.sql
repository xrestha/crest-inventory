-- Three Roster features confirmed with the user before building:
--   1. Publish + real Web Push notification to staff when a roster month is published.
--   2. Mutual shift-swap request/approval (employee <-> employee <-> admin).
--   3. Leave-conflict auto-block — no schema needed, reads existing hr_leave_requests
--      (handled entirely in Roster.jsx, not in this migration).
--
-- Push notifications are sent by a new Edge Function (supabase/functions/hr-push) that holds the
-- VAPID private key — this migration only adds the subscription table + the DB-side plumbing the
-- function reads/writes.

-- ── Roster publish state ─────────────────────────────────────────────────────────────────────
-- One row per BS month once an admin/manager publishes it. Self-service employees never see a
-- draft roster — get_my_roster (below) is gated on this existing.
CREATE TABLE public.hr_roster_publish_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    bs_year integer NOT NULL,
    bs_month integer NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT hr_roster_publish_state_unique UNIQUE (client_id, bs_year, bs_month)
);
ALTER TABLE public.hr_roster_publish_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_own ON public.hr_roster_publish_state USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_roster_publish_state TO authenticated;

-- ── Push subscriptions ───────────────────────────────────────────────────────────────────────
-- Generic, not HR-specific — one row per browser/device subscription. RLS is just "this row is
-- mine" (profile_id = auth.uid()); unlike payslips/roster/etc a subscription endpoint isn't
-- another employee's data to leak, so self-service employees read/write it directly with no RPC.
CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_subscription ON public.push_subscriptions USING (
  profile_id = auth.uid()
) WITH CHECK (
  profile_id = auth.uid()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

-- ── Shift swap requests ──────────────────────────────────────────────────────────────────────
-- Mutual swap: requester proposes trading their day for a coworker's day. Flow:
-- pending_target -> (target accepts) -> pending_admin -> (admin approves/rejects) -> approved
--                 -> (target declines) -> rejected_by_target
CREATE TABLE public.hr_shift_swap_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    requester_employee_id uuid NOT NULL REFERENCES public.hr_employees(id),
    target_employee_id uuid NOT NULL REFERENCES public.hr_employees(id),
    bs_year integer NOT NULL,
    bs_month integer NOT NULL,
    requester_bs_day integer NOT NULL,
    target_bs_day integer NOT NULL,
    -- Snapshots for display — the actual swap operates on the live hr_roster rows, these are
    -- just so the request list can show what was being swapped even after it's done.
    requester_shift_type_id uuid REFERENCES public.hr_shift_types(id) ON DELETE SET NULL,
    target_shift_type_id uuid REFERENCES public.hr_shift_types(id) ON DELETE SET NULL,
    status text DEFAULT 'pending_target' NOT NULL,
    note text,
    target_responded_at timestamp with time zone,
    admin_decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    admin_decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_shift_swap_requests_status_check CHECK (status = ANY (ARRAY[
      'pending_target'::text, 'pending_admin'::text, 'approved'::text,
      'rejected_by_target'::text, 'rejected_by_admin'::text, 'cancelled'::text
    ]))
);
ALTER TABLE public.hr_shift_swap_requests ENABLE ROW LEVEL SECURITY;
-- Same self-service exclusion as every other table holding another employee's data (S306) —
-- admin/manager read the pending-admin queue via a normal scoped query; self-service employees
-- only ever reach their own requests through the RPCs below.
CREATE POLICY client_own ON public.hr_shift_swap_requests USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_shift_swap_requests TO authenticated;

-- ── get_my_roster: gate on publish state ────────────────────────────────────────────────────
-- Replaces the S306 version — a self-service employee must never see a draft (unpublished)
-- month, only what's been explicitly published.
CREATE OR REPLACE FUNCTION public.get_my_roster(p_bs_year integer, p_bs_month integer) RETURNS TABLE(
    bs_day integer, shift_type_name text, shift_start text, shift_end text, note text
) LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
  v_client_id uuid;
BEGIN
  SELECT hr_employee_id, client_id INTO v_employee_id, v_client_id
  FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hr_roster_publish_state
    WHERE client_id = v_client_id AND bs_year = p_bs_year AND bs_month = p_bs_month
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT r.bs_day, st.name, st.start_time, st.end_time, r.note
    FROM hr_roster r
    LEFT JOIN hr_shift_types st ON st.id = r.shift_type_id
    WHERE r.employee_id = v_employee_id AND r.bs_year = p_bs_year AND r.bs_month = p_bs_month
    ORDER BY r.bs_day;
END;
$$;

CREATE FUNCTION public.get_my_roster_publish_status(p_bs_year integer, p_bs_month integer) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT client_id INTO v_client_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_client_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM hr_roster_publish_state
    WHERE client_id = v_client_id AND bs_year = p_bs_year AND bs_month = p_bs_month
  );
END;
$$;

-- ── Shift swap RPCs ──────────────────────────────────────────────────────────────────────────
-- So an employee can pick a valid coworker+day to request, without exposing the whole
-- hr_roster table to a self-service session. Gated on the same publish state as get_my_roster.
CREATE FUNCTION public.get_coworker_roster(p_bs_year integer, p_bs_month integer) RETURNS TABLE(
    employee_id uuid, full_name text, bs_day integer, shift_type_id uuid, shift_type_name text
) LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
  v_client_id uuid;
BEGIN
  SELECT hr_employee_id, client_id INTO v_employee_id, v_client_id
  FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hr_roster_publish_state
    WHERE client_id = v_client_id AND bs_year = p_bs_year AND bs_month = p_bs_month
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT r.employee_id, e.full_name, r.bs_day, r.shift_type_id, st.name
    FROM hr_roster r
    JOIN hr_employees e ON e.id = r.employee_id
    LEFT JOIN hr_shift_types st ON st.id = r.shift_type_id
    WHERE r.client_id = v_client_id AND r.bs_year = p_bs_year AND r.bs_month = p_bs_month
      AND r.employee_id <> v_employee_id
    ORDER BY e.full_name, r.bs_day;
END;
$$;

CREATE FUNCTION public.request_shift_swap(
    p_target_employee_id uuid, p_bs_year integer, p_bs_month integer,
    p_my_bs_day integer, p_target_bs_day integer, p_note text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
  v_employee_id uuid;
  v_my_shift uuid;
  v_target_shift uuid;
  v_id uuid;
BEGIN
  SELECT client_id, hr_employee_id INTO v_client_id, v_employee_id
  FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_target_employee_id = v_employee_id THEN RAISE EXCEPTION 'cannot swap with yourself'; END IF;

  IF NOT EXISTS (SELECT 1 FROM hr_employees WHERE id = p_target_employee_id AND client_id = v_client_id) THEN
    RAISE EXCEPTION 'coworker not found';
  END IF;

  SELECT shift_type_id INTO v_my_shift FROM hr_roster
    WHERE client_id = v_client_id AND employee_id = v_employee_id
      AND bs_year = p_bs_year AND bs_month = p_bs_month AND bs_day = p_my_bs_day;
  IF v_my_shift IS NULL THEN RAISE EXCEPTION 'you have no shift on that day'; END IF;

  SELECT shift_type_id INTO v_target_shift FROM hr_roster
    WHERE client_id = v_client_id AND employee_id = p_target_employee_id
      AND bs_year = p_bs_year AND bs_month = p_bs_month AND bs_day = p_target_bs_day;
  IF v_target_shift IS NULL THEN RAISE EXCEPTION 'coworker has no shift on that day'; END IF;

  INSERT INTO hr_shift_swap_requests (
    client_id, requester_employee_id, target_employee_id, bs_year, bs_month,
    requester_bs_day, target_bs_day, requester_shift_type_id, target_shift_type_id, note, status
  ) VALUES (
    v_client_id, v_employee_id, p_target_employee_id, p_bs_year, p_bs_month,
    p_my_bs_day, p_target_bs_day, v_my_shift, v_target_shift, left(coalesce(p_note, ''), 500), 'pending_target'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.respond_shift_swap(p_request_id uuid, p_accept boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
  v_row hr_shift_swap_requests;
BEGIN
  SELECT hr_employee_id INTO v_employee_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

  SELECT * INTO v_row FROM hr_shift_swap_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row IS NULL THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_row.target_employee_id <> v_employee_id THEN RAISE EXCEPTION 'not authorized for this request'; END IF;
  IF v_row.status <> 'pending_target' THEN RAISE EXCEPTION 'request is no longer pending'; END IF;

  UPDATE hr_shift_swap_requests
  SET status = CASE WHEN p_accept THEN 'pending_admin' ELSE 'rejected_by_target' END,
      target_responded_at = now()
  WHERE id = p_request_id;
END;
$$;

CREATE FUNCTION public.get_my_swap_requests() RETURNS TABLE(
    id uuid, requester_employee_id uuid, requester_name text, target_employee_id uuid, target_name text,
    bs_year integer, bs_month integer, requester_bs_day integer, target_bs_day integer,
    requester_shift_name text, target_shift_name text, status text, note text, created_at timestamp with time zone
) LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SELECT hr_employee_id INTO v_employee_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT s.id, s.requester_employee_id, re.full_name, s.target_employee_id, te.full_name,
           s.bs_year, s.bs_month, s.requester_bs_day, s.target_bs_day,
           rst.name, tst.name, s.status, s.note, s.created_at
    FROM hr_shift_swap_requests s
    JOIN hr_employees re ON re.id = s.requester_employee_id
    JOIN hr_employees te ON te.id = s.target_employee_id
    LEFT JOIN hr_shift_types rst ON rst.id = s.requester_shift_type_id
    LEFT JOIN hr_shift_types tst ON tst.id = s.target_shift_type_id
    WHERE s.requester_employee_id = v_employee_id OR s.target_employee_id = v_employee_id
    ORDER BY s.created_at DESC;
END;
$$;

NOTIFY pgrst, 'reload schema';
