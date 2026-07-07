-- Security Advisor pass (2026-07-07): closes real gaps in a handful of SECURITY DEFINER
-- functions that bypass RLS by design but were missing their own internal authorization check —
-- unlike apply_pos_item_comps/get_pos_staff_list/get_client_profile_names, which already gate on
-- "caller is admin OR belongs to p_client_id" before touching anything.

-- CRITICAL: admin_clear_audit_logs had NO authorization check at all. AuditLog.js's `adminOnly`
-- route guard is frontend-only — any authenticated (non-admin) user could call
-- /rest/v1/rpc/admin_clear_audit_logs directly with no arguments and wipe the audit trail for
-- every client on the platform. Same is_admin() guard pattern as find_user_id_by_email.
CREATE OR REPLACE FUNCTION public.admin_clear_audit_logs(
    p_client_id uuid DEFAULT NULL::uuid,
    p_table_name text DEFAULT NULL::text,
    p_cutoff timestamp with time zone DEFAULT NULL::timestamp with time zone
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM audit_logs
  WHERE
    (p_client_id  IS NULL OR client_id  = p_client_id)
    AND (p_table_name IS NULL OR table_name = p_table_name)
    AND (p_cutoff     IS NULL OR created_at >= p_cutoff);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- HIGH: get_cooccurrence bypasses RLS on pos_order_items/pos_orders (SECURITY DEFINER) with no
-- check that the caller belongs to p_client_id — linter shows it callable even by anon, meaning
-- anyone could read which menu items ANY client's restaurant sells together. Same
-- admin-or-same-client guard as apply_pos_item_comps. Also adds the missing search_path.
CREATE OR REPLACE FUNCTION public.get_cooccurrence(
    p_client_id uuid, p_recipe_id uuid, p_days integer DEFAULT 90
) RETURNS TABLE(paired_recipe_id uuid, co_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (
    public.is_admin() OR p_client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized for this client';
  END IF;

  RETURN QUERY
    SELECT b.recipe_id AS paired_recipe_id, COUNT(*) AS co_count
    FROM pos_order_items a
    JOIN pos_order_items b ON a.order_id = b.order_id AND a.recipe_id != b.recipe_id
    JOIN pos_orders o ON o.id = a.order_id
    WHERE a.client_id = p_client_id
      AND a.recipe_id = p_recipe_id
      AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY b.recipe_id
    ORDER BY co_count DESC
    LIMIT 10;
END;
$$;

-- LOW (defensive — confirmed dead code, no .rpc('get_next_pos_comp_slip_no', ...) call left in
-- src/ since apply_pos_item_comps superseded it): same missing-guard shape, cheap to close since
-- it's still a live, unguarded endpoint regardless of frontend usage.
CREATE OR REPLACE FUNCTION public.get_next_pos_comp_slip_no(p_client_id uuid, p_fy text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  next_no integer;
BEGIN
  IF NOT (
    public.is_admin() OR p_client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized for this client';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pos_comp_slip_no:' || p_client_id::text || ':' || p_fy));
  SELECT COALESCE(MAX(n), 0) + 1 INTO next_no FROM (
    SELECT invoice_no AS n FROM pos_orders WHERE client_id = p_client_id AND invoice_fy = p_fy AND close_type = 'writeoff'
    UNION ALL
    SELECT comp_no AS n FROM pos_order_items WHERE client_id = p_client_id AND comp_fy = p_fy
  ) combined;
  RETURN next_no;
END;
$$;

-- Hygiene only (Security Advisor's function_search_path_mutable warning) — these three are
-- STABLE/IMMUTABLE, NOT SECURITY DEFINER, so they were never independently exploitable: a direct
-- RPC call runs as the caller's own role, and RLS on items/recipes blocks it exactly as any other
-- raw query would be blocked. Only get_guest_menu (which IS SECURITY DEFINER) can reach real data
-- through them. Fixing the mutable search_path anyway since the linter flags it and it's free.
ALTER FUNCTION public._nutrition_convert_qty(numeric, text, text) SET search_path = public;
ALTER FUNCTION public._nutrition_item_contribution(uuid, numeric) SET search_path = public;
ALTER FUNCTION public._nutrition_rollup(uuid, uuid[]) SET search_path = public;

NOTIFY pgrst, 'reload schema';
