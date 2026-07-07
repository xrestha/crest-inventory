-- Operating hours per client, used by the Covers Report's Seat Occupancy/RevPASH tab
-- (revenue per available seat-hour needs total open hours for the period; NULL = not
-- configured yet, tab shows a "set your operating hours" prompt instead of a number).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pos_open_time  text; -- e.g. '11:00'
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pos_close_time text; -- e.g. '22:00'
