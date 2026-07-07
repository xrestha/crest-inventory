-- Mitigates a POS audit finding: PosLogin.jsx's PIN literally IS the full Supabase Auth password
-- (signInWithPassword({ email: pos_email, password: pin })), and pos_email itself is handed to
-- any anonymous visitor via get_pos_staff (needed for the staff picker on this same public page).
-- Net effect without this: an attacker gets every staff member's login email for free and only
-- needs to brute-force a short numeric PIN directly against Supabase's auth endpoint, with no
-- app-level lockout. This doesn't change the underlying PIN-as-password design (a bigger,
-- separate decision) — it adds the standard mitigation for low-entropy credentials: lock the
-- account out for a cooldown period after repeated failures.
--
-- Restricted to real PIN-based POS staff (pos_role IS NOT NULL AND pos_email IS NOT NULL, same
-- filter as get_pos_staff) so this can't be pointed at an Owner's email/password login instead.
-- Trade-off accepted: since both RPCs are anon-callable (this runs before authentication), anyone
-- can call record_pos_pin_attempt(some_staff_id, false) directly to lock that one staff member
-- out for the cooldown window without ever attempting a real sign-in — a griefing/DoS risk, but a
-- far smaller one than leaving the PIN itself unlimited-attempt brute-forceable.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pos_pin_failed_attempts integer DEFAULT 0 NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pos_pin_locked_until timestamp with time zone;

CREATE FUNCTION public.check_pos_pin_lock(p_staff_id uuid) RETURNS TABLE(
    locked boolean, locked_until timestamp with time zone
) LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT (pos_pin_locked_until IS NOT NULL AND pos_pin_locked_until > now()), pos_pin_locked_until
  FROM profiles
  WHERE id = p_staff_id AND pos_role IS NOT NULL AND pos_email IS NOT NULL;
$$;

-- Call after every sign-in attempt (success or failure). 5 failures locks the account for 15
-- minutes; a success (or the lock expiring) clears the counter. Returns the resulting lock state
-- so the frontend can show "Too many attempts, try again in Xm" without a second round-trip.
CREATE FUNCTION public.record_pos_pin_attempt(p_staff_id uuid, p_success boolean) RETURNS TABLE(
    locked boolean, locked_until timestamp with time zone
) LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_success THEN
    UPDATE profiles SET pos_pin_failed_attempts = 0, pos_pin_locked_until = NULL
    WHERE id = p_staff_id AND pos_role IS NOT NULL AND pos_email IS NOT NULL;
  ELSE
    UPDATE profiles
    SET pos_pin_failed_attempts = CASE
          WHEN pos_pin_locked_until IS NOT NULL AND pos_pin_locked_until <= now() THEN 1
          ELSE pos_pin_failed_attempts + 1
        END,
        pos_pin_locked_until = CASE
          WHEN (CASE WHEN pos_pin_locked_until IS NOT NULL AND pos_pin_locked_until <= now() THEN 1
                     ELSE pos_pin_failed_attempts + 1 END) >= 5
          THEN now() + interval '15 minutes'
          ELSE pos_pin_locked_until
        END
    WHERE id = p_staff_id AND pos_role IS NOT NULL AND pos_email IS NOT NULL;
  END IF;

  RETURN QUERY
    SELECT (pos_pin_locked_until IS NOT NULL AND pos_pin_locked_until > now()), pos_pin_locked_until
    FROM profiles
    WHERE id = p_staff_id AND pos_role IS NOT NULL AND pos_email IS NOT NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';
