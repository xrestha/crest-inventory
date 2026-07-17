-- Fix: pos_parking_slips and ims_gate_passes both defaulted print_count to 1 instead of 0
-- (20260717120000_parking_slips_gate_passes.sql). For Parking Slips this was a real, user-visible
-- bug: printParkingSlip() computes newCount = (slip.print_count || 0) + 1 and labels anything > 1
-- as "REPRINT #N" (same convention as pos_orders' COPY_LABEL) — but since a brand-new slip's
-- print_count already started at 1, the very first print (right after Issue & Print) computed
-- newCount = 2, printing "REPRINT #2" on what is actually the original slip. Every existing slip
-- went through the same insert-then-immediately-print path (NewParkingSlipModal.jsx's
-- handleSave), so every row's stored count is exactly 1 higher than it should be — corrected in
-- place below.
--
-- ims_gate_passes has the same wrong default. Currently harmless — GatePasses.jsx's reprint()
-- increments print_count but never reads it back to render a label, and nothing displays this
-- count anywhere — but fixed for the same reason, before anything relies on it.
ALTER TABLE public.pos_parking_slips ALTER COLUMN print_count SET DEFAULT 0;
ALTER TABLE public.ims_gate_passes   ALTER COLUMN print_count SET DEFAULT 0;

UPDATE public.pos_parking_slips SET print_count = print_count - 1 WHERE print_count > 0;
UPDATE public.ims_gate_passes   SET print_count = print_count - 1 WHERE print_count > 0;
