ALTER TABLE public.hr_payslips ADD COLUMN IF NOT EXISTS tada_amount numeric(12,2) DEFAULT 0;

NOTIFY pgrst, 'reload schema';
