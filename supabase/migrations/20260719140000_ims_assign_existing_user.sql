-- Follow-up to S419/S420: the "+ Add Staff" modal on /ims/staff could only create brand-new
-- logins (fresh email+password, or linked to an HR employee) — there was no way to take an
-- account that already exists for the client (e.g. created via Admin → Clients → Manage → Users,
-- ClientDrawer.js's generic "Add User" flow) and just assign it an IMS role. This adds that path.
--
-- Eligibility is deliberately narrow: only "plain" client-role accounts with NONE of the three
-- staff-account markers (pos_role, hr_self_service, ims_role) already set. Assigning ims_role to
-- an account that's already POS PIN staff or HR self-service would be silently broken — those
-- accounts are already RESTRICTIVE-policy-blocked from every pure-IMS table (no_pos_pin_staff) or
-- from all IMS+POS tables entirely (no_self_service_accounts), independent of ims_role. The UI
-- would show them as having IMS access while every actual read/write still gets blocked by RLS.
-- update_ims_role itself is hardened with the same check server-side, not just left as a UI-only
-- safeguard, in case it's ever called directly.

CREATE FUNCTION public.get_ims_eligible_users(p_client_id uuid) RETURNS TABLE(
    id uuid, full_name text, email text
) LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_client_id uuid;
  caller_role text;
BEGIN
  SELECT p.client_id, p.role INTO caller_client_id, caller_role
  FROM profiles p WHERE p.id = auth.uid();

  IF caller_role = 'admin' OR caller_client_id = p_client_id THEN
    RETURN QUERY
      SELECT p.id, p.full_name, u.email::text
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.client_id = p_client_id
        AND p.role = 'client'
        AND p.pos_role IS NULL
        AND p.hr_self_service = false
        AND p.ims_role IS NULL
        AND p.id != auth.uid()
      ORDER BY p.full_name;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ims_eligible_users(uuid) FROM anon;

NOTIFY pgrst, 'reload schema';
