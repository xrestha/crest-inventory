-- Fixes a gap in 20260721010000_monthly_owner_reports.sql: CREATE TABLE + RLS policies alone
-- do not grant table-level access — Postgres checks the base GRANT before RLS is ever
-- evaluated, so `authenticated` had zero privileges on this table regardless of policy content
-- (42501 "permission denied for table monthly_owner_reports", not an RLS violation; found live
-- via a client trying to view the Ashadh 2083 report). Same class of gotcha as every other
-- raw-SQL CREATE TABLE in this project — no role grants are automatic, they must be explicit.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_owner_reports TO authenticated;

NOTIFY pgrst, 'reload schema';
