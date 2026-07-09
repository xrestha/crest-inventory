-- Connects HR-enrolled employees to POS Staff when a client has both modules: POS Staff's
-- "+ Add Staff" can now link an existing hr_employees record instead of retyping a fresh name,
-- writing profiles.hr_employee_id (present since baseline, previously only used by HR
-- Self-Service — this is the second consumer, POS PIN staff, not self-service).

-- get_pos_staff_list now also surfaces hr_employee_id + employee_code so the frontend can show
-- which POS accounts are HR-linked (and which employee_code) without a second round-trip.
-- Adding OUT columns changes the function's return row type, which CREATE OR REPLACE can't do
-- (42P13) — drop first.
DROP FUNCTION IF EXISTS public.get_pos_staff_list(uuid);
CREATE FUNCTION public.get_pos_staff_list(p_client_id uuid) RETURNS TABLE(
    id uuid, full_name text, pos_role text, pos_job_title text, last_seen_at timestamp with time zone,
    hr_employee_id uuid, employee_code text
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
      SELECT p.id, p.full_name, p.pos_role, p.pos_job_title, p.last_seen_at, p.hr_employee_id, e.employee_code
      FROM profiles p
      LEFT JOIN hr_employees e ON e.id = p.hr_employee_id
      WHERE p.client_id = p_client_id
        AND p.role = 'client'
        AND p.pos_email IS NOT NULL
      ORDER BY p.full_name;
  END IF;
END;
$$;

-- Prevents the same HR employee from ending up with two POS PIN accounts (defense in depth —
-- the Edge Function also checks this before creating one).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_hr_employee_pos_unique
  ON public.profiles (hr_employee_id) WHERE (pos_email IS NOT NULL);

NOTIFY pgrst, 'reload schema';
