-- Two bugs found during live end-to-end testing of S419's IMS staff role system:
--
-- 1. ImsStaff.jsx reads/writes settings.ims_custom_roles (mirroring PosStaff.jsx's
--    settings.pos_custom_roles), but the column was never added to the settings table in
--    20260719120000_ims_staff_roles.sql — every load 400'd with "column settings.ims_custom_roles
--    does not exist".
-- 2. get_ims_staff_list's RETURNS TABLE declared `email text`, but auth.users.email is actually
--    `character varying(255)` — every call 400'd with "structure of query does not match function
--    result type" (Postgres error 42804). Fixed with an explicit ::text cast rather than changing
--    the declared return type, matching how `text` is used everywhere else in this schema.

ALTER TABLE public.settings ADD COLUMN ims_custom_roles jsonb DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.get_ims_staff_list(p_client_id uuid) RETURNS TABLE(
    id uuid, full_name text, email text, ims_role text, ims_job_title text,
    last_seen_at timestamp with time zone, hr_employee_id uuid, employee_code text
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
      SELECT p.id, p.full_name, u.email::text, p.ims_role, p.ims_job_title, p.last_seen_at, p.hr_employee_id, e.employee_code
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN hr_employees e ON e.id = p.hr_employee_id
      WHERE p.client_id = p_client_id
        AND p.role = 'client'
        AND p.ims_role IS NOT NULL
      ORDER BY p.full_name;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
