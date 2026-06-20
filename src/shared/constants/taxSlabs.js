// Nepal Income Tax slabs — FY 2082/83 (IRD)
export const TAX_SLABS = [
  { min: 0,       max: 500000,  rate: 0.01 },
  { min: 500000,  max: 700000,  rate: 0.10 },
  { min: 700000,  max: 1000000, rate: 0.20 },
  { min: 1000000, max: 2000000, rate: 0.30 },
  { min: 2000000, max: Infinity, rate: 0.36 },
]

export const FEMALE_TAX_REBATE = 0.10  // 10% discount on computed tax

// Returns annual TDS in NPR. Pass annualIncome (NPR), isFemale boolean.
export function computeAnnualTDS(annualIncome, isFemale = false) {
  let tax = 0
  let remaining = annualIncome
  for (const { min, max, rate } of TAX_SLABS) {
    if (remaining <= min) break
    const taxable = Math.min(remaining, max) - min
    tax += taxable * rate
  }
  if (isFemale) tax *= (1 - FEMALE_TAX_REBATE)
  return Math.round(tax)
}

// Monthly TDS deduction
export function computeMonthlyTDS(annualIncome, isFemale = false) {
  return Math.round(computeAnnualTDS(annualIncome, isFemale) / 12)
}
