import { useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useScopedDb } from '../../../shared/hooks/useScopedDb'
import Modal from '../../../components/Modal'
import Tip from '../../../components/Tip'
import { printParkingSlip } from './parkingSlipHtml'

// Issue+auto-print a new customer vehicle parking token. Standalone — not tied to any order/table,
// so a walk-in who hasn't ordered yet can still get one. Only entry point is PosParkingSlips.jsx,
// which already gates the "+ New Parking Slip" Fab behind hasPosAccess('supervisor'); this modal
// re-checks the same gate internally as defense-in-depth, same double-gate pattern as
// IssueCreditNoteModal.jsx.
export default function NewParkingSlipModal({ outletName, propertyAddress, onClose, onIssued }) {
  const { clientId, profile, hasPosAccess } = useAuth()
  const { scopedInsert } = useScopedDb()

  const [vehicleNumber, setVehicleNumber] = useState('')
  const [vehicleType, setVehicleType]     = useState('')
  const [customerName, setCustomerName]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  if (!hasPosAccess('supervisor')) {
    return (
      <Modal onClose={onClose} title="Parking Slip" maxWidth={420}>
        <p style={{ color: 'var(--theme-text2)', fontSize: 13 }}>Issuing a Parking Slip requires Supervisor access or above.</p>
        <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </Modal>
    )
  }

  async function handleSave() {
    if (!vehicleNumber.trim()) { setError('Vehicle number is required.'); return }
    setSaving(true); setError('')
    const { data: slip, error: insErr } = await scopedInsert('pos_parking_slips', {
      vehicle_number: vehicleNumber.trim().toUpperCase(),
      vehicle_type:   vehicleType.trim() || null,
      customer_name:  customerName.trim() || null,
      issued_by:      profile?.id || null,
    }, { single: true })
    if (insErr) { setError(insErr.message); setSaving(false); return }
    setSaving(false)
    printParkingSlip(clientId, slip, outletName, propertyAddress, profile?.full_name)
    onIssued()
  }

  return (
    <Modal onClose={onClose} title="New Parking Slip" maxWidth={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-field">
          <label>Vehicle Number *</label>
          <input
            value={vehicleNumber}
            onChange={e => setVehicleNumber(e.target.value)}
            placeholder="e.g. BA 2 KHA 1234"
            autoFocus
          />
        </div>
        <div className="form-field">
          <label><Tip text="Optional — e.g. Car, Bike, Van">Vehicle Type</Tip></label>
          <input
            value={vehicleType}
            onChange={e => setVehicleType(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="form-field">
          <label>Customer Name</label>
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>
      {error && <p style={{ color: 'var(--theme-red)', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}
      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Issue & Print'}
        </button>
      </div>
    </Modal>
  )
}
