import React from 'react'

// Crest POS — Point of Sale module
// Build priority: Tables → Orders → KOT → Billing → Payments → Shifts → Void → Reports
// See CREST_SUITE_PROJECT_CONTEXT.md section 11 for full feature specification.
export default function Pos() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#cbd5e1' }}>
      <h2 style={{ color: '#c9a84c', marginBottom: 8 }}>Crest POS</h2>
      <p style={{ marginBottom: 4 }}>Point of Sale — coming soon.</p>
      <p style={{ fontSize: 13, opacity: 0.6 }}>
        Table management, order taking, KOT, billing, QR payments, shift Z-reports.
      </p>
    </div>
  )
}
