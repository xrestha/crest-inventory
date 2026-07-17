-- Parking Slips / Gate Passes: a slip/pass left "open" (staff forgot Mark Exited) never expired
-- or reset on its own — it would still show in the Open tab every day after, indefinitely.
-- PosParkingSlips.jsx/GatePasses.jsx now sweep-close any still-open row from a PREVIOUS day the
-- moment either page is next loaded (client-side, same "no server cron infra in this project"
-- pattern Periods.js's own expired-period banner already uses — see CLAUDE.md). Never deletes
-- data; just flips status to 'closed'. This column distinguishes that automatic sweep-close from
-- a real staff-confirmed Mark Exited (which never sets it), so reporting/audit can always tell
-- the difference between "we know the vehicle actually left" and "we just stopped tracking it."
ALTER TABLE public.pos_parking_slips ADD COLUMN auto_closed boolean DEFAULT false NOT NULL;
ALTER TABLE public.ims_gate_passes   ADD COLUMN auto_closed boolean DEFAULT false NOT NULL;
