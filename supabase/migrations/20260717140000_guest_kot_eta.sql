-- Extends get_guest_table_status (20260707160000_guest_table_kot_status.sql) with a computed
-- remaining_minutes so the guest QR menu can show an ETA once the kitchen/bar has actually
-- started preparing the order — same estimate staff enter on Start in the Kitchen Display
-- (pos_kot_log.estimated_prep_minutes, added 20260717130000_pos_kot_estimated_prep_time.sql).
--
-- Only a computed minute count is returned, never the raw started_at timestamp or the estimate
-- itself — same "whitelisted, non-sensitive fields only" rule the rest of this function already
-- follows. NULL whenever there's nothing meaningful to show (no open order, worst ticket isn't
-- in_progress yet, or none of the in_progress tickets have an estimate on them) — the frontend
-- simply omits the ETA line in that case, same graceful-degradation the kot_status column already
-- relies on.
--
-- Return-column change requires dropping first — CREATE OR REPLACE can't add columns to an
-- existing RETURNS TABLE signature.
DROP FUNCTION IF EXISTS public.get_guest_table_status(uuid);

CREATE FUNCTION public.get_guest_table_status(p_table_id uuid) RETURNS TABLE(
    has_open_order boolean, kot_status text, remaining_minutes integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_id uuid;
  v_pos_enabled boolean;
  v_order_id uuid;
  v_worst_rank int;
  v_max_ready_at timestamptz;
  r RECORD;
  rank int;
  ready_at_calc timestamptz;
BEGIN
  SELECT t.client_id INTO v_client_id FROM pos_tables t WHERE t.id = p_table_id;
  IF v_client_id IS NULL THEN
    has_open_order := false; kot_status := NULL; remaining_minutes := NULL; RETURN NEXT; RETURN;
  END IF;

  SELECT c.pos_enabled INTO v_pos_enabled FROM clients c WHERE c.id = v_client_id;
  IF NOT COALESCE(v_pos_enabled, false) THEN
    has_open_order := false; kot_status := NULL; remaining_minutes := NULL; RETURN NEXT; RETURN;
  END IF;

  -- Most recently opened, in case a stray second 'open' row ever exists for the same table.
  SELECT o.id INTO v_order_id FROM pos_orders o
  WHERE o.table_id = p_table_id AND o.status = 'open'
  ORDER BY o.opened_at DESC LIMIT 1;

  IF v_order_id IS NULL THEN
    has_open_order := false; kot_status := NULL; remaining_minutes := NULL; RETURN NEXT; RETURN;
  END IF;

  -- Worst (least-advanced) status across all tickets sent for this order — same "still needs
  -- attention" logic as the staff floor-view badge in PosOrders.jsx. Alongside it, the latest
  -- (slowest) estimated-ready time across in_progress tickets — same "whole order isn't ready
  -- until its slowest ticket is" framing PosOrders.jsx's loadKotStatus already uses.
  v_worst_rank := NULL;
  v_max_ready_at := NULL;
  FOR r IN SELECT status, started_at, estimated_prep_minutes FROM pos_kot_log WHERE order_id = v_order_id
  LOOP
    rank := CASE r.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'ready' THEN 2 ELSE 0 END;
    IF v_worst_rank IS NULL OR rank < v_worst_rank THEN v_worst_rank := rank; END IF;
    IF r.status = 'in_progress' AND r.started_at IS NOT NULL AND r.estimated_prep_minutes IS NOT NULL THEN
      ready_at_calc := r.started_at + (r.estimated_prep_minutes * interval '1 minute');
      IF v_max_ready_at IS NULL OR ready_at_calc > v_max_ready_at THEN v_max_ready_at := ready_at_calc; END IF;
    END IF;
  END LOOP;

  has_open_order := true;
  kot_status := CASE v_worst_rank WHEN 0 THEN 'new' WHEN 1 THEN 'in_progress' WHEN 2 THEN 'ready' ELSE NULL END;
  remaining_minutes := CASE
    WHEN kot_status = 'in_progress' AND v_max_ready_at IS NOT NULL
      THEN CEIL(EXTRACT(EPOCH FROM (v_max_ready_at - now())) / 60)::integer
    ELSE NULL
  END;
  RETURN NEXT;
END;
$$;

NOTIFY pgrst, 'reload schema';
