import React from 'react'

// Owner Dashboard — cross-module P&L summary (Suite Growth and above)
// Data sources: ims_monthly_summary + pos_monthly_summary + hr_monthly_summary
// Shows: food cost %, labour cost %, gross profit % — live on mobile
export default function OwnerDashboard() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#cbd5e1' }}>
      <h2 style={{ color: '#c9a84c', marginBottom: 8 }}>Owner Dashboard</h2>
      <p style={{ marginBottom: 4 }}>Cross-module P&amp;L — Suite Growth and above.</p>
      <p style={{ fontSize: 13, opacity: 0.6 }}>
        Food cost %, labour cost %, gross profit % — requires POS + HR integration.
      </p>
    </div>
  )
}
