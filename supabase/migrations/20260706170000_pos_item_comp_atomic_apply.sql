-- Closes a race in item-level comp (20260706140000_pos_item_level_comp.sql): the frontend was
-- calling get_next_pos_comp_slip_no() and then, in a SEPARATE round trip, writing the comp
-- rows that consume that number. pg_advisory_xact_lock only holds for the duration of a single
-- RPC call, so it released the instant get_next_pos_comp_slip_no returned — two terminals
-- comping within that gap (or one comping while another table's whole-order Complimentary
-- close committed) could get the same NC number. Bundling numbering + the actual writes into
-- one SECURITY DEFINER function means the lock is held from the MAX(...) computation through to
-- the INSERT/UPDATE, in the same transaction as assign_pos_invoice_no's writeoff branch, which
-- takes the same lock key. This also makes the comp application atomic (all rows or none, no
-- more partial-success state from a loop the frontend used to run item-by-item) so the frontend
-- can now abort the whole Charge before it bills anything if this fails, instead of billing the
-- order and hoping the comp write happens to succeed after.
--
-- get_next_pos_comp_slip_no is left in place (unused going forward) rather than dropped — no
-- other caller depends on it, and dropping a SECURITY DEFINER function that shipped a few hours
-- ago carries no benefit worth the risk.
CREATE FUNCTION public.apply_pos_item_comps(
    p_order_id uuid,
    p_client_id uuid,
    p_fy text,
    p_comp_reason text,
    p_comped_by uuid,
    p_full_recipe_ids uuid[],
    p_partial jsonb
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_comp_no integer;
  v_now timestamptz := now();
  v_item jsonb;
  v_order_client uuid;
BEGIN
  SELECT client_id INTO v_order_client FROM pos_orders WHERE id = p_order_id;
  IF v_order_client IS NULL OR v_order_client <> p_client_id THEN
    RAISE EXCEPTION 'order does not belong to this client';
  END IF;
  IF NOT (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR p_client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized for this client';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pos_comp_slip_no:' || p_client_id::text || ':' || p_fy));

  SELECT COALESCE(MAX(n), 0) + 1 INTO v_comp_no FROM (
    SELECT invoice_no AS n FROM pos_orders WHERE client_id = p_client_id AND invoice_fy = p_fy AND close_type = 'writeoff'
    UNION ALL
    SELECT comp_no AS n FROM pos_order_items WHERE client_id = p_client_id AND comp_fy = p_fy
  ) combined;

  -- A fully-comped line (compQty === the line's whole qty) just gets marked comped in place.
  IF p_full_recipe_ids IS NOT NULL AND array_length(p_full_recipe_ids, 1) > 0 THEN
    UPDATE pos_order_items
    SET comped = true, comp_reason = p_comp_reason, comped_by = p_comped_by,
        comped_at = v_now, comp_fy = p_fy, comp_no = v_comp_no
    WHERE order_id = p_order_id AND recipe_id = ANY(p_full_recipe_ids);
  END IF;

  -- A partially-comped line (e.g. 1 of 3) needs splitting: shrink the existing row to the paid
  -- remainder, and insert a new row for the comped portion.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_partial, '[]'::jsonb))
  LOOP
    UPDATE pos_order_items
    SET qty = qty - (v_item->>'comp_qty')::integer
    WHERE order_id = p_order_id AND recipe_id = (v_item->>'recipe_id')::uuid;

    INSERT INTO pos_order_items (
      order_id, client_id, recipe_id, name, category, qty, unit_price, vat_rate, sent_to_kot,
      comped, comp_reason, comped_by, comped_at, comp_fy, comp_no
    ) VALUES (
      p_order_id, p_client_id, (v_item->>'recipe_id')::uuid, v_item->>'name', v_item->>'category',
      (v_item->>'comp_qty')::integer, (v_item->>'unit_price')::numeric, (v_item->>'vat_rate')::numeric,
      COALESCE((v_item->>'sent_to_kot')::boolean, false),
      true, p_comp_reason, p_comped_by, v_now, p_fy, v_comp_no
    );
  END LOOP;

  RETURN v_comp_no;
END;
$$;

-- Unrelated to the race fix above, but the same table's CHECK constraint needs two more values:
--
-- 'pos_comp': writeSalesEntries (PosOrders.jsx) currently posts a comped item's qty_sold under
-- source='pos' — identical to a real sale, which is what let Sales Report/demand forecasting
-- overstate revenue (fixed client-side in 20260706140000 by excluding comped pos_order_items
-- rows) but does nothing for the IMS-side revenue reports (MonthlySummary, PeriodComparison,
-- AnnualSummary, MenuRepricing, MenuEngineering, Overheads, BestSellers, Sales.js), which read
-- sales_entries directly and have no comped-flag to filter on. Splitting the comped portion into
-- its own source lets consumption-based reads (Variance, TheoreticalVariance, ShrinkageReport,
-- ReorderReport, StockReport, Recipes.js's per-cover overhead — all unfiltered by source today)
-- keep including it unchanged, since a comped dish still consumed ingredients and occupied a
-- cover, while revenue reads can now exclude it explicitly.
--
-- 'pos_credit': IssueCreditNoteModal.jsx has posted source='pos_credit' since Credit Notes
-- shipped, to reverse a corrected bill's revenue. It was never in this constraint, so every
-- single one of those inserts has been silently failing the CHECK (swallowed by that code's own
-- try/catch) — Credit Notes have never actually reversed IMS-side revenue. Adding it here is a
-- straight bug fix, not new scope.
ALTER TABLE public.sales_entries DROP CONSTRAINT sales_entries_source_check;
ALTER TABLE public.sales_entries ADD CONSTRAINT sales_entries_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'pos'::text, 'pos_comp'::text, 'pos_credit'::text]));

-- A second, more severe pre-existing bug found while touching this table: sales_entries has a
-- UNIQUE(period_id, recipe_id, bs_day) constraint (baseline schema, predates POS) with no
-- exception for `source`. writeSalesEntries does a plain INSERT per order close with no
-- ON CONFLICT handling and discards the insert's error — so today, the SECOND order in a day
-- that sells a recipe already sold earlier that same day silently fails to record at all (same
-- for a second same-day Credit Note against the same recipe). Every downstream reader
-- (Variance, Sales Report, MonthlySummary, ...) only ever SUMs qty_sold across however many rows
-- match a given period+recipe+day — none of them assume exactly one row — so nothing depends on
-- this constraint holding. Dropping it turns sales_entries into what it already behaves like
-- everywhere it's read: an append-only log, one row per contributing event, summed at read time.
-- The manual-entry bulk/day save (Sales.js) is unaffected — it already enforces "one set of
-- values per day" procedurally (DELETE for that period+day, then INSERT fresh rows) rather than
-- relying on the DB constraint.
ALTER TABLE public.sales_entries DROP CONSTRAINT sales_entries_period_id_recipe_id_bs_day_key;

NOTIFY pgrst, 'reload schema';
