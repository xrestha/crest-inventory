-- Auto-adjust Demand Forecast on known holiday days instead of only flagging them. The forecast
-- already joined hr_holiday_calendar for display but explicitly did NOT adjust the number for it —
-- Nepal holiday footfall swings both directions depending on the specific festival and the business
-- (some restaurants close for Dashain Tika, others get slammed the week after), so the multiplier is
-- owner-set per holiday occurrence in Holiday Calendar rather than guessed by software.
ALTER TABLE public.hr_holiday_calendar
  ADD COLUMN IF NOT EXISTS demand_multiplier numeric;

-- Persisted onto the covers-level demand_forecast_daily row (recipe_id IS NULL) so a reloaded
-- forecast (Demand Forecast page, Roster's Labor Forecast tab) can show which days were
-- holiday-flagged/adjusted without re-joining hr_holiday_calendar live — that join only happens
-- once, at compute time in runForecast().
ALTER TABLE public.demand_forecast_daily
  ADD COLUMN IF NOT EXISTS holiday_name text,
  ADD COLUMN IF NOT EXISTS holiday_multiplier numeric;

NOTIFY pgrst, 'reload schema';
