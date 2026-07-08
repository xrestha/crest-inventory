-- S306 (20260707260000) locked HR tables away from self-service employee logins with
-- `AND NOT public.is_hr_self_service()` — a self-service JWT is same-client, so without that
-- clause the plain admin-or-same-client policy lets an employee read AND write every HR row for
-- their client straight through the REST API. S306/S307 covered hr_tada_claims, hr_tada_claim_items,
-- hr_incentive_configs, hr_incentives, hr_payslips, hr_salary_components, hr_advances,
-- hr_employees, hr_leave_requests, hr_roster, hr_shift_swap_requests, and
-- hr_roster_publish_state — but missed the eight baseline-era tables below.
--
-- Concretely, before this migration a self-service employee could, with nothing but their own
-- login and the anon key:
--   * rewrite their own hr_attendance (absent → present, inflate ot_hours) — direct payroll fraud
--   * insert hr_overtime_entries for themselves
--   * raise their own quota or flip paid/unpaid on hr_leave_types
--   * read every coworker's attendance, OT, festival allowance, and payroll-run rows
--
-- The self-service UI needs none of these: it reads only `settings` directly (deliberate — see
-- SelfServiceHome.jsx) and everything else through SECURITY DEFINER RPCs (get_my_roster,
-- get_my_hr_payslips, submit_my_leave_request, ...), which are unaffected by RLS. So the fix is
-- the same blanket exclusion S306 applied everywhere else. Tables already carry their GRANTs;
-- only the policies change.

-- hr_attendance — the payroll input; the most sensitive of the eight.
DROP POLICY client_own ON public.hr_attendance;
CREATE POLICY client_own ON public.hr_attendance USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_overtime_entries
DROP POLICY client_rw ON public.hr_overtime_entries;
CREATE POLICY client_own ON public.hr_overtime_entries USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_leave_types — self-service reads these via get_my_leave_types(), never directly.
DROP POLICY client_own ON public.hr_leave_types;
CREATE POLICY client_own ON public.hr_leave_types USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_festival_allowances
DROP POLICY client_own ON public.hr_festival_allowances;
CREATE POLICY client_own ON public.hr_festival_allowances USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_payroll_runs
DROP POLICY client_own ON public.hr_payroll_runs;
CREATE POLICY client_own ON public.hr_payroll_runs USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_advance_repayments — carried TWO permissive baseline policies; both must go, since
-- permissive policies OR together and either one alone would keep the door open.
DROP POLICY client_access ON public.hr_advance_repayments;
DROP POLICY hr_advance_repayments_policy ON public.hr_advance_repayments;
CREATE POLICY client_own ON public.hr_advance_repayments USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_holiday_calendar — not personal data, but holidays feed payroll (2× holiday OT), so writes
-- must not be open to staff; reads go through no self-service path today either.
DROP POLICY client_rw ON public.hr_holiday_calendar;
CREATE POLICY client_own ON public.hr_holiday_calendar USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

-- hr_shift_types — shift names/hours reach self-service via get_my_roster()'s join, never a
-- direct read; hours also feed Attendance's Generate-from-Roster, so writes stay owner-only.
DROP POLICY client_access ON public.hr_shift_types;
CREATE POLICY client_own ON public.hr_shift_types USING (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
) WITH CHECK (
  (public.is_admin() OR client_id = public.my_client_id()) AND NOT public.is_hr_self_service()
);

NOTIFY pgrst, 'reload schema';
