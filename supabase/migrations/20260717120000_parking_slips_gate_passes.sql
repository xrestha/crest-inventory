-- Parking Slip feature: two independent per-module standalone-token tables, one DB-trigger
-- sequential number each, same shape as assign_pos_order_no()/assign_pos_credit_note_no().
--
-- pos_parking_slips — POS side. Not tied to any order/table (walk-in vehicle token). Create+print
-- gated in the frontend behind hasPosAccess('supervisor'); the page itself (view + Mark Exited)
-- is open to any POS staff rank, same shape as pos_orders/pos_customers.
--
-- ims_gate_passes — IMS side. No staff/supervisor role concept in IMS at all, so no extra
-- frontend role gate beyond ModuleGate — same as vendors/purchase_orders. vendor_id optionally
-- links an existing vendors row; vendor_name is always snapshotted (freeform or copied from the
-- linked vendor) so print/list never needs a join and survives the vendor being later deleted.

CREATE TABLE public.pos_parking_slips (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    slip_no integer,
    vehicle_number text NOT NULL,
    vehicle_type text,
    customer_name text,
    time_in timestamp with time zone DEFAULT now() NOT NULL,
    time_out timestamp with time zone,
    status text DEFAULT 'open' NOT NULL,
    issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    exited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes text,
    print_count integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pos_parking_slips_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]))
);

CREATE INDEX pos_parking_slips_open_idx ON public.pos_parking_slips (client_id) WHERE status = 'open';

CREATE TABLE public.ims_gate_passes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    pass_no integer,
    vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
    vendor_name text NOT NULL,
    driver_name text NOT NULL,
    vehicle_number text NOT NULL,
    purpose text NOT NULL,
    time_in timestamp with time zone DEFAULT now() NOT NULL,
    time_out timestamp with time zone,
    status text DEFAULT 'open' NOT NULL,
    issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    exited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes text,
    print_count integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ims_gate_passes_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text])),
    CONSTRAINT ims_gate_passes_purpose_check CHECK (purpose = ANY (ARRAY['delivery'::text, 'pickup'::text, 'maintenance'::text, 'other'::text]))
);

CREATE INDEX ims_gate_passes_open_idx ON public.ims_gate_passes (client_id) WHERE status = 'open';

-- ── Sequential per-client slip numbers (same shape as assign_pos_order_no) ──────────────────
CREATE FUNCTION public.assign_pos_parking_slip_no() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.slip_no IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('pos_parking_slip_no:' || NEW.client_id::text));
    SELECT COALESCE(MAX(slip_no), 0) + 1 INTO NEW.slip_no
    FROM pos_parking_slips WHERE client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_assign_pos_parking_slip_no BEFORE INSERT ON public.pos_parking_slips
  FOR EACH ROW EXECUTE FUNCTION public.assign_pos_parking_slip_no();

CREATE FUNCTION public.assign_ims_gate_pass_no() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.pass_no IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('ims_gate_pass_no:' || NEW.client_id::text));
    SELECT COALESCE(MAX(pass_no), 0) + 1 INTO NEW.pass_no
    FROM ims_gate_passes WHERE client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_assign_ims_gate_pass_no BEFORE INSERT ON public.ims_gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.assign_ims_gate_pass_no();

-- ── RLS: standard same-client policy, per CLAUDE.md ──────────────────────────────────────────
ALTER TABLE public.pos_parking_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ims_gate_passes   ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_parking_slips_client ON public.pos_parking_slips
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY ims_gate_passes_client ON public.ims_gate_passes
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  );

-- ── RESTRICTIVE policies (S316 pattern) ──────────────────────────────────────────────────────
-- pos_parking_slips: same treatment as pos_orders/pos_customers — HR self-service accounts must
-- not see POS operational data, but POS PIN staff need full normal access (they're the ones
-- issuing/closing tokens), so this table is NOT added to no_pos_pin_staff.
CREATE POLICY no_self_service_accounts ON public.pos_parking_slips AS RESTRICTIVE FOR ALL
  USING (NOT public.is_hr_self_service()) WITH CHECK (NOT public.is_hr_self_service());

-- ims_gate_passes: same treatment as vendors/purchase_orders — a pure-IMS table with no POS code
-- path, so both a POS PIN staff JWT and an HR self-service JWT are excluded, mirroring exactly
-- how S316 fenced off `vendors` (present on both restrictive-policy lists in
-- 20260708130000_staff_account_business_table_isolation.sql).
CREATE POLICY no_self_service_accounts ON public.ims_gate_passes AS RESTRICTIVE FOR ALL
  USING (NOT public.is_hr_self_service()) WITH CHECK (NOT public.is_hr_self_service());
CREATE POLICY no_pos_pin_staff ON public.ims_gate_passes AS RESTRICTIVE FOR ALL
  USING (NOT public.is_pos_pin_staff()) WITH CHECK (NOT public.is_pos_pin_staff());

-- ── Grants (Supabase Grants Gotcha — raw-SQL tables get no role grants by default) ───────────
GRANT SELECT, INSERT, UPDATE ON public.pos_parking_slips TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ims_gate_passes   TO authenticated;

NOTIFY pgrst, 'reload schema';
