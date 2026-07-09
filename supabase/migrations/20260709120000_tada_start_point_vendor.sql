-- Adds a "Start Point" to TADA claims (client-configurable dropdown, same shape as Purpose
-- options) and a vendor picker for Purchase-purpose trips (destination stays a plain text
-- column — picking a vendor just fills it in, no FK link, per this session's design call).

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tada_start_points jsonb;
ALTER TABLE public.hr_tada_claims ADD COLUMN IF NOT EXISTS start_point text;

-- Self-service can't read `vendors` directly (RESTRICTIVE no_self_service_accounts policy,
-- S316 — vendors is an IMS business table) — exposes just id/name of active vendors so the
-- Self-Service TADA tab can offer the same vendor picker the manager form gets, same reasoning
-- as every other get_my_* self-service RPC.
CREATE FUNCTION public.get_my_client_vendors() RETURNS TABLE(id uuid, name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT client_id INTO v_client_id FROM profiles WHERE id = auth.uid() AND hr_self_service = true;
  IF v_client_id IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT v.id, v.name FROM vendors v WHERE v.client_id = v_client_id AND v.is_active = true ORDER BY v.name;
END;
$$;

-- CREATE OR REPLACE with p_start_point appended (default NULL) — extends the existing
-- submit_my_tada_claim signature without breaking it; existing params/order unchanged.
CREATE OR REPLACE FUNCTION public.submit_my_tada_claim(
    p_trip_purpose text, p_destination text, p_start_date date, p_end_date date,
    p_notes text, p_items jsonb, p_start_point text DEFAULT NULL
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

  INSERT INTO hr_tada_claims (client_id, employee_id, trip_purpose, destination, start_point, start_date, end_date, total_amount, status, submitted_by, notes)
  VALUES (v_client_id, v_employee_id, NULLIF(left(coalesce(p_trip_purpose, ''), 200), ''), NULLIF(left(coalesce(p_destination, ''), 200), ''),
          NULLIF(left(coalesce(p_start_point, ''), 200), ''), p_start_date, p_end_date, v_total, 'pending', auth.uid(), NULLIF(left(coalesce(p_notes, ''), 500), ''))
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
