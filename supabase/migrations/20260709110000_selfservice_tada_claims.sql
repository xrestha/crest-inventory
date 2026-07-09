-- Self-Service (SelfServiceHome.jsx) previously covered payslip/leave/roster only — TADA Claims
-- submission was an explicit, deliberate gap when TADA Claims shipped (see comment in
-- 20260707260000_hr_tada_incentives_selfservice.sql). This adds a submission channel for staff,
-- mirroring the existing submit_my_leave_request pattern exactly: SECURITY DEFINER, resolves the
-- caller's own hr_employee_id, inserts as 'pending' into the SAME table the manager-entry form
-- (TadaClaims.jsx) writes to — the existing approve/reject/pay flow there is completely unchanged.
--
-- Approval, rejection, mark-paid, and the ⚙ Settings (vehicle rates / purpose options) stay
-- manager/admin/owner-only via TadaClaims.jsx + the standard client_own RLS policy — this
-- migration only adds read-your-own + submit-your-own for the self-service role.

CREATE FUNCTION public.get_my_tada_claims() RETURNS SETOF hr_tada_claims
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SELECT hr_employee_id INTO v_employee_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM hr_tada_claims WHERE employee_id = v_employee_id ORDER BY created_at DESC;
END;
$$;

-- hr_tada_claim_items has no client_id/employee_id of its own (scoped via claim_id, same as the
-- manager view reads it) — this checks ownership through the parent claim before returning rows.
CREATE FUNCTION public.get_my_tada_claim_items(p_claim_id uuid) RETURNS SETOF hr_tada_claim_items
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SELECT hr_employee_id INTO v_employee_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT i.* FROM hr_tada_claim_items i
    JOIN hr_tada_claims c ON c.id = i.claim_id
    WHERE i.claim_id = p_claim_id AND c.employee_id = v_employee_id;
END;
$$;

-- p_items: jsonb array of { category, description, amount } — mirrors what TadaClaims.jsx's
-- handleAdd persists (vehicle/distanceKm are UI-only there too, never sent to the DB). Total is
-- computed server-side from the items, same as the manager form computes addTotal client-side.
CREATE FUNCTION public.submit_my_tada_claim(
    p_trip_purpose text, p_destination text, p_start_date date, p_end_date date,
    p_notes text, p_items jsonb
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
  v_employee_id uuid;
  v_claim_id uuid;
  v_total numeric := 0;
  v_item jsonb;
BEGIN
  SELECT client_id, hr_employee_id INTO v_client_id, v_employee_id
  FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

  SELECT COALESCE(SUM(GREATEST((item->>'amount')::numeric, 0)), 0) INTO v_total
  FROM jsonb_array_elements(p_items) AS item;
  IF v_total <= 0 THEN RAISE EXCEPTION 'add at least one expense line with an amount'; END IF;

  INSERT INTO hr_tada_claims (client_id, employee_id, trip_purpose, destination, start_date, end_date, total_amount, status, submitted_by, notes)
  VALUES (v_client_id, v_employee_id, NULLIF(left(coalesce(p_trip_purpose, ''), 200), ''), NULLIF(left(coalesce(p_destination, ''), 200), ''),
          p_start_date, p_end_date, v_total, 'pending', auth.uid(), NULLIF(left(coalesce(p_notes, ''), 500), ''))
  RETURNING id INTO v_claim_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'amount')::numeric, 0) > 0 THEN
      INSERT INTO hr_tada_claim_items (claim_id, category, description, amount)
      VALUES (v_claim_id, v_item->>'category', NULLIF(v_item->>'description', ''), (v_item->>'amount')::numeric);
    END IF;
  END LOOP;

  RETURN v_claim_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
