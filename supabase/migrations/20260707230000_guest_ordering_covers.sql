-- Guest ordering UX polish: guest enters covers when placing their order, so staff no longer
-- has to re-enter it in the "How many covers?" numpad — see PosOrders.jsx's openTable, which now
-- pre-fills covers from this column instead of showing that popup for a table with a pending
-- guest request.

ALTER TABLE public.pos_guest_order_requests ADD COLUMN IF NOT EXISTS covers integer NOT NULL DEFAULT 1;

-- Appending a trailing defaulted parameter is CREATE OR REPLACE-compatible (existing 3-arg-shaped
-- calls still resolve via the default) — no DROP needed, unlike the get_guest_menu output-column
-- change in an earlier migration.
CREATE OR REPLACE FUNCTION public.submit_guest_order(
    p_table_id uuid, p_items jsonb, p_notes text DEFAULT NULL, p_covers integer DEFAULT 1
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
  v_pos_enabled boolean;
  v_pos_plan text;
  v_guest_ordering_flag boolean;
  v_request_id uuid;
  v_snapshot jsonb := '[]'::jsonb;
  r RECORD;
  item RECORD;
  v_qty numeric;
  v_note text;
BEGIN
  SELECT t.client_id INTO v_client_id FROM pos_tables t WHERE t.id = p_table_id;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Table not found'; END IF;

  SELECT c.pos_enabled, c.pos_plan INTO v_pos_enabled, v_pos_plan FROM clients c WHERE c.id = v_client_id;
  IF NOT COALESCE(v_pos_enabled, false) THEN RAISE EXCEPTION 'POS not enabled for this restaurant'; END IF;

  SELECT COALESCE(f.guest_ordering, false) INTO v_guest_ordering_flag FROM feature_flags f WHERE f.client_id = v_client_id;
  IF NOT (v_guest_ordering_flag OR v_pos_plan = 'pro') THEN
    RAISE EXCEPTION 'Guest ordering is not enabled for this restaurant';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Order is empty'; END IF;
  IF jsonb_array_length(p_items) > 30 THEN RAISE EXCEPTION 'Too many items in one order'; END IF;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(recipe_id uuid, qty numeric, note text)
  LOOP
    IF item.recipe_id IS NULL THEN CONTINUE; END IF;
    v_qty := LEAST(GREATEST(COALESCE(item.qty, 0), 0), 50);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    v_note := NULLIF(left(COALESCE(item.note, ''), 200), '');

    SELECT rc.id, rc.name, rc.category, rc.selling_price, rc.vat_rate INTO r
    FROM recipes rc
    WHERE rc.id = item.recipe_id AND rc.client_id = v_client_id AND rc.is_active = true
      AND rc.pos_enabled = true AND rc.category IS DISTINCT FROM 'Sub-Recipe';
    IF r.id IS NULL THEN CONTINUE; END IF;

    v_snapshot := v_snapshot || jsonb_build_object(
      'recipe_id', r.id, 'name', r.name, 'category', r.category,
      'unit_price', r.selling_price, 'vat_rate', r.vat_rate,
      'qty', v_qty, 'note', v_note
    );
  END LOOP;

  IF jsonb_array_length(v_snapshot) = 0 THEN RAISE EXCEPTION 'No valid items in order'; END IF;

  INSERT INTO pos_guest_order_requests (client_id, table_id, items, guest_notes, covers)
  VALUES (
    v_client_id, p_table_id, v_snapshot, NULLIF(left(COALESCE(p_notes, ''), 500), ''),
    LEAST(GREATEST(COALESCE(p_covers, 1), 1), 50)
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
