import { useMemo } from 'react'
import { BS_MONTHS, daysInBsMonth, bsToAd, adToBs, getBsToday } from '../../utils/bsCalendar'

export function useBS() {
  return useMemo(() => ({
    bsMonths: BS_MONTHS,
    bsMonthName: (index) => BS_MONTHS[index - 1] ?? '',
    daysInBsMonth,
    bsToAd,
    adToBs,
    getBsToday,
  }), [])
}
