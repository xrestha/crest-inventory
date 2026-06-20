// Nepal Labour Act leave entitlements
export const LEAVE_TYPES = [
  { code: 'annual',    label: 'Annual Leave',    days_per_year: 18,  accrual: '1.5/month', paid: true  },
  { code: 'sick',      label: 'Sick Leave',       days_per_year: 12,  accrual: '1/month',   paid: true  },
  { code: 'casual',    label: 'Casual Leave',     days_per_year: 6,   accrual: null,        paid: true  },
  { code: 'maternity', label: 'Maternity Leave',  days_per_year: 98,  accrual: null,        paid: true  },
  { code: 'paternity', label: 'Paternity Leave',  days_per_year: 15,  accrual: null,        paid: true  },
  { code: 'mourning',  label: 'Mourning Leave',   days_per_year: 13,  accrual: null,        paid: true  },
  { code: 'unpaid',    label: 'Unpaid Leave',     days_per_year: null, accrual: null,       paid: false },
]
