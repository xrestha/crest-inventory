// Pure functions for the Roster board's demand-forecast labor overlay — no React, no Supabase.
// calcHours/rKey/computeEmpHours/computeDayHours are extracted verbatim (same logic) from what
// used to be Roster.jsx's local calcHours/empHrs/dayHrs, so the board's existing Total hrs/day
// footer keeps behaving identically after the extraction.
import { hourlyRateOf } from '../payroll/payrollCompute'

export function calcHours(start, end) {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60 // overnight shift
  return parseFloat((mins / 60).toFixed(1))
}

export function rKey(year, month, day, empId) {
  return `${year}:${month}:${day}:${empId}`
}

function shiftHours(shift) {
  if (!shift) return 0
  return shift.hours ?? calcHours(shift.start_time, shift.end_time) ?? 0
}

export function computeEmpHours(columns, roster, shiftMap, empId) {
  return columns.reduce((sum, col) => {
    const e = roster[rKey(col.bsYear, col.bsMonth, col.bsDay, empId)]
    return sum + shiftHours(e ? shiftMap[e.shift_type_id] : null)
  }, 0)
}

export function computeDayHours(col, employees, roster, shiftMap) {
  return employees.reduce((sum, emp) => {
    const e = roster[rKey(col.bsYear, col.bsMonth, col.bsDay, emp.id)]
    return sum + shiftHours(e ? shiftMap[e.shift_type_id] : null)
  }, 0)
}

// Total planned labor cost for one roster day: for every employee scheduled that day, resolve
// their hourly-equivalent rate from pay_basis/basic_salary (the same resolution
// payrollCompute.js's hourlyRateOf uses for OT pricing — reused directly, not the whole payroll
// engine, which is a whole-period run-once computation, not a live per-shift number) × hours
// scheduled. `monthDays` only matters for monthly-basis employees; pass daysInBsMonth for the
// BS month the column falls in (a roster week can straddle two BS months).
export function computePlannedLaborCost(col, employees, roster, shiftMap, monthDays) {
  return employees.reduce((sum, emp) => {
    const e = roster[rKey(col.bsYear, col.bsMonth, col.bsDay, emp.id)]
    const s = e ? shiftMap[e.shift_type_id] : null
    const hrs = shiftHours(s)
    if (hrs === 0) return sum
    const rate = hourlyRateOf(emp.pay_basis || 'monthly', parseFloat(emp.basic_salary) || 0, monthDays)
    return sum + hrs * rate
  }, 0)
}

// Suggests a headcount for a forecasted covers count against a target covers-per-staff ratio
// (settings.covers_per_staff_target, default 20). Ceil — better slightly over-staffed than short
// on a busy forecasted day.
export function computeRecommendedHeadcount(forecastCovers, coversPerStaffTarget = 20) {
  if (forecastCovers == null || !coversPerStaffTarget) return null
  return Math.ceil(forecastCovers / coversPerStaffTarget)
}
