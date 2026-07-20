-- The employee-facing payslip did not reconcile. get_my_hr_payslips returned basic/allowances/
-- gross/ssf/other/advance/tds/net only, so SelfServiceHome rendered a Net Pay that could not be
-- derived from any line shown. Ashadh 2083, all four employees of one client:
--
--   JEEVAN    lines imply 19,784   net shown 21,479   (+1,695 unexplained)
--   SARITA    lines imply 19,792   net shown 20,569   (+777)
--   ANANDA    lines imply 24,851   net shown 14,790   (-10,061)
--   RONISH    lines imply 26,880   net shown 11,910   (-14,970)
--
-- The two large gaps are absence_deduction — the deduction employees dispute most often, and the
-- one they most need itemized to check. Ronish lost more than half his pay with no line naming it.
-- ot_amount and tada_amount were missing in the other direction: work paid for but never shown.
--
-- absence_deduction, tada_amount and ot_hours were not in the RETURNS TABLE at all, so this could
-- not be fixed in the frontend alone. Adds the full payslip breakdown plus the employee identity
-- fields the shared PayslipBody component needs for its header — self-service accounts are fenced
-- off hr_employees by the S316 restrictive policies, so this RPC is their only path to their own
-- name/code/department/SSF number.
--
-- present_days / absent_days are included deliberately: the amount alone doesn't let an employee
-- verify a dock, but the day count lets them say "I was there on the 12th".
--
-- DROP + CREATE rather than CREATE OR REPLACE — the return type changes, which REPLACE rejects.
-- Keeps the qualified `pr.id` from 20260720120000 (the OUT param `id` shadows profiles.id);
-- every column is table-qualified here for the same reason, since the OUT parameter list now also
-- includes full_name, department, ssf_no and others that collide with hr_employees columns.

DROP FUNCTION IF EXISTS public.get_my_hr_payslips();

CREATE FUNCTION public.get_my_hr_payslips() RETURNS TABLE(
    id uuid, bs_year integer, bs_month integer, run_status text,
    pay_basis text, basic numeric, allowances numeric, gross numeric,
    ot_hours numeric, ot_amount numeric,
    worked_days numeric, hours_worked numeric, present_days numeric, absent_days numeric,
    absence_deduction numeric, ssf_employee numeric, ssf_employer numeric,
    other_deductions numeric, advance_deduction numeric, tds numeric,
    tada_amount numeric, net_pay numeric,
    full_name text, employee_code text, department text, ssf_no text, ssf_enrolled boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SELECT pr.hr_employee_id INTO v_employee_id
    FROM profiles pr WHERE pr.id = auth.uid() AND pr.hr_self_service = true;
  IF v_employee_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT p.id, mp.bs_year, mp.bs_month, r.status,
           p.pay_basis, p.basic, p.allowances, p.gross,
           p.ot_hours, p.ot_amount,
           p.worked_days, p.hours_worked, p.present_days, p.absent_days,
           p.absence_deduction, p.ssf_employee, p.ssf_employer,
           p.other_deductions, p.advance_deduction, p.tds,
           p.tada_amount, p.net_pay,
           e.full_name, e.employee_code, e.department, e.ssf_no, e.ssf_enrolled
    FROM hr_payslips p
    JOIN hr_payroll_runs r ON r.id = p.run_id
    JOIN monthly_periods mp ON mp.id = r.period_id
    JOIN hr_employees e ON e.id = p.employee_id
    WHERE p.employee_id = v_employee_id AND r.status = 'finalized'
    ORDER BY mp.bs_year DESC, mp.bs_month DESC;
END;
$$;

-- DROP discarded the old ACL, so re-apply the 20260712210000 hardening: authenticated sessions
-- only, never anon.
REVOKE EXECUTE ON FUNCTION public.get_my_hr_payslips() FROM anon;
