import React from 'react'

// Crest HR — Human Resources module
// Build priority: Employees → Salary → Leave → Roster → Attendance → OT → SSF → TDS → Payroll
// See CREST_SUITE_PROJECT_CONTEXT.md section 12 for full feature specification.
export default function Hr() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#cbd5e1' }}>
      <h2 style={{ color: 'var(--theme-accent)', marginBottom: 8 }}>Crest HR</h2>
      <p style={{ marginBottom: 4 }}>Human Resources — coming soon.</p>
      <p style={{ fontSize: 13, opacity: 0.6 }}>
        Employee master, rostering, payroll, SSF, TDS, leave management.
      </p>
    </div>
  )
}
