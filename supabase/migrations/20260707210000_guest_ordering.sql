-- Guest QR self-ordering (Pro-tier feature, gated by feature_flags.guest_ordering).
--
-- Guest submissions never write directly into pos_order_items. PosOrders.jsx's existing save
-- path (performSave) does a full delete-and-reinsert of the staff's entire local cart on every
-- save — a guest writing into the same rows while staff had a stale local cart open would
-- silently get wiped on the next staff save. So a guest submission lands in a staging table
-- (pos_guest_order_requests) instead; a staff member must open the table and tap Accept, which
-- merges the request's items into their own local cart the same way tapping a menu tile does —
-- the actual pos_order_items write still only ever happens through the existing performSave().
--
-- Same anonymous-caller pattern as get_guest_menu/get_guest_table_status throughout: no internal
-- auth check on the guest-facing RPCs (there's no session to check), only ever whitelisted
-- fields returned, and all money-relevant fields (name/price/vat/category) are re-snapshotted
-- server-side from `recipes` rather than trusted from the client payload.

ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS guest_ordering boolean DEFAULT false;

CREATE TABLE public.pos_guest_order_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    table_id uuid NOT NULL REFERENCES public.pos_tables(id),
    items jsonb NOT NULL,
    guest_notes text,
    status text DEFAULT 'pending' NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT pos_guest_order_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'dismissed'::text]))
);

CREATE INDEX pos_guest_order_requests_pending_idx ON public.pos_guest_order_requests (client_id, table_id)
  WHERE status = 'pending';

ALTER TABLE public.pos_guest_order_requests ENABLE ROW LEVEL SECURITY;

-- Staff need SELECT (poll for pending requests) + UPDATE (Accept/Dismiss). No INSERT policy —
-- the only writer is submit_guest_order() below, which is SECURITY DEFINER and so bypasses RLS
-- entirely; a real INSERT policy here would be dead weight (and would need to somehow allow
-- anon, which we deliberately don't want for a table holding jsonb order contents).
CREATE POLICY pos_guest_order_requests_select ON public.pos_guest_order_requests
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY pos_guest_order_requests_update ON public.pos_guest_order_requests
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  );

GRANT SELECT, UPDATE ON public.pos_guest_order_requests TO authenticated;

-- ── Guest submits an order ───────────────────────────────────────────────────────────────────
-- p_items: jsonb array of {"recipe_id": uuid, "qty": number, "note": text (optional)}. Anything
-- else the client sends (price, name, category) is ignored — only recipe_id + qty + note are
-- ever read from the payload; everything money-relevant is re-derived from `recipes` below.
CREATE FUNCTION public.submit_guest_order(p_table_id uuid, p_items jsonb, p_notes text DEFAULT NULL) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
  v_pos_enabled boolean;
  v_guest_ordering boolean;
  v_request_id uuid;
  v_snapshot jsonb := '[]'::jsonb;
  r RECORD;
  item RECORD;
  v_qty numeric;
  v_note text;
BEGIN
  SELECT t.client_id INTO v_client_id FROM pos_tables t WHERE t.id = p_table_id;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Table not found'; END IF;

  SELECT c.pos_enabled INTO v_pos_enabled FROM clients c WHERE c.id = v_client_id;
  IF NOT COALESCE(v_pos_enabled, false) THEN RAISE EXCEPTION 'POS not enabled for this restaurant'; END IF;

  SELECT COALESCE(f.guest_ordering, false) INTO v_guest_ordering FROM feature_flags f WHERE f.client_id = v_client_id;
  IF NOT v_guest_ordering THEN RAISE EXCEPTION 'Guest ordering is not enabled for this restaurant'; END IF;

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

  INSERT INTO pos_guest_order_requests (client_id, table_id, items, guest_notes)
  VALUES (v_client_id, p_table_id, v_snapshot, NULLIF(left(COALESCE(p_notes, ''), 500), ''))
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- Anonymous guest polls this to see whether staff accepted/dismissed their request. p_request_id
-- (an unguessable uuid returned only to the submitter) is the sole scoping — no client_id/table
-- filter needed since a guest can only ever learn their own request's id.
CREATE FUNCTION public.get_guest_order_request_status(p_request_id uuid) RETURNS TABLE(
    status text, decided_at timestamp with time zone
) LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT r.status, r.decided_at FROM pos_guest_order_requests r WHERE r.id = p_request_id;
$$;

-- get_guest_menu gains one more output column (guest_ordering_enabled) so the guest menu's one
-- page-load call already knows whether to render cart UI. Adding an output column isn't a
-- CREATE OR REPLACE-compatible change, so drop and recreate — behavior is otherwise identical to
-- the version from 20260707100000_guest_menu.sql.
DROP FUNCTION public.get_guest_menu(uuid);

CREATE FUNCTION public.get_guest_menu(p_table_id uuid) RETURNS TABLE(
    outlet_name text, table_name text,
    recipe_id uuid, name text, category text, selling_price numeric, vat_rate numeric,
    description text, image_url text, is_veg boolean,
    nutrition_enabled boolean, has_nutrition boolean,
    energy_kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric, sugar_g numeric, sodium_mg numeric,
    allergens jsonb, guest_ordering_enabled boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
  v_table_name text;
  v_outlet_name text;
  v_pos_enabled boolean;
  v_nutrition_enabled boolean;
  v_guest_ordering_enabled boolean;
  r RECORD;
  roll jsonb;
BEGIN
  SELECT t.client_id, t.name INTO v_client_id, v_table_name FROM pos_tables t WHERE t.id = p_table_id;
  IF v_client_id IS NULL THEN RETURN; END IF;

  SELECT c.name, c.pos_enabled INTO v_outlet_name, v_pos_enabled FROM clients c WHERE c.id = v_client_id;
  IF NOT COALESCE(v_pos_enabled, false) THEN RETURN; END IF;

  SELECT COALESCE(f.nutrition_facts, false), COALESCE(f.guest_ordering, false)
    INTO v_nutrition_enabled, v_guest_ordering_enabled
  FROM feature_flags f WHERE f.client_id = v_client_id;

  FOR r IN
    SELECT rc.id, rc.name, rc.category, rc.selling_price, rc.vat_rate, rc.description, rc.image_url, rc.is_veg
    FROM recipes rc
    WHERE rc.client_id = v_client_id AND rc.is_active = true AND rc.pos_enabled = true
      AND rc.category IS DISTINCT FROM 'Sub-Recipe'
    ORDER BY rc.category NULLS LAST, rc.name
  LOOP
    IF v_nutrition_enabled THEN
      roll := public._nutrition_rollup(r.id);
    ELSE
      roll := NULL;
    END IF;

    outlet_name := v_outlet_name;
    table_name := v_table_name;
    recipe_id := r.id;
    name := r.name;
    category := r.category;
    selling_price := r.selling_price;
    vat_rate := r.vat_rate;
    description := r.description;
    image_url := r.image_url;
    is_veg := r.is_veg;
    nutrition_enabled := v_nutrition_enabled;
    has_nutrition := v_nutrition_enabled AND COALESCE((roll->>'covered')::boolean, false);
    energy_kcal := (roll->>'energy_kcal')::numeric;
    protein_g := (roll->>'protein_g')::numeric;
    carbs_g := (roll->>'carbs_g')::numeric;
    fat_g := (roll->>'fat_g')::numeric;
    sugar_g := (roll->>'sugar_g')::numeric;
    sodium_mg := (roll->>'sodium_mg')::numeric;
    allergens := COALESCE(roll->'allergens', '[]'::jsonb);
    guest_ordering_enabled := v_guest_ordering_enabled;
    RETURN NEXT;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
