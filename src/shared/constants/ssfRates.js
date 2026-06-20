// Social Security Fund (SSF) rates — Nepal
export const SSF_EMPLOYEE_RATE = 0.11  // 11% of basic — deducted from gross
export const SSF_EMPLOYER_RATE = 0.20  // 20% of basic — additional employer cost
export const SSF_TOTAL_RATE    = 0.31

// Returns { employee, employer, total } in NPR for a given basic salary
export function computeSSF(basicSalary) {
  const basic = parseFloat(basicSalary) || 0
  return {
    employee: Math.round(basic * SSF_EMPLOYEE_RATE),
    employer: Math.round(basic * SSF_EMPLOYER_RATE),
    total:    Math.round(basic * SSF_TOTAL_RATE),
  }
}
