import { useState } from 'react'

const fmt = n => Math.round(n || 0).toLocaleString('en-NP')
const inp = {
  background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)',
  borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--theme-text1)',
  outline: 'none', width: '100%', fontFamily: 'inherit',
}
const lbl = { fontSize: 11, color: 'var(--theme-text3)', marginBottom: 4, display: 'block' }
const VEHICLE_TYPES = [
  { key: '2w', label: '2-Wheeler' },
  { key: '4w', label: '4-Wheeler' },
  { key: 'ev', label: 'EV' },
]

function stopLabel(i, total) {
  if (i === 0) return 'Start'
  if (i === total - 1) return 'End'
  return `Stop ${i}`
}

// A manual km × rate calculator for TADA's Transport line — no map/geocoding, per the researched
// v1 scope (a live Google Maps/OSRM lookup was explicitly deferred as its own separate decision,
// since it commits Crest to a recurring Google Cloud bill or a self-hosted routing server, not
// just a code change). Stop labels are plain text the employee types themselves; "distance" is
// whatever they read off their own phone's map, an odometer, or a known regular route.
//
// vehicleRates: { '2w': number|null, '4w': number|null, ev: number|null } — picking a vehicle
// type re-fills Rate/KM from the configured rate for that type; the field stays freely editable
// afterward (e.g. a one-off trip at a different rate than the usual policy).
export default function CalculateFareModal({ vehicleRates, onConfirm, onClose }) {
  const [stops, setStops] = useState(['', ''])
  const [distanceKm, setDistanceKm] = useState('')
  const [vehicleKey, setVehicleKey] = useState('2w')
  const [rate, setRate] = useState(vehicleRates['2w'] != null ? String(vehicleRates['2w']) : '')

  function selectVehicle(key) {
    setVehicleKey(key)
    setRate(vehicleRates[key] != null ? String(vehicleRates[key]) : '')
  }

  function setStop(i, v) { setStops(s => s.map((x, idx) => idx === i ? v : x)) }
  function addStop() { setStops(s => [...s.slice(0, -1), '', s[s.length - 1]]) }
  function removeStop(i) { setStops(s => s.length > 2 ? s.filter((_, idx) => idx !== i) : s) }

  const dist = parseFloat(distanceKm) || 0
  const r = parseFloat(rate) || 0
  const amount = Math.round(dist * r)
  const canConfirm = dist > 0 && r > 0

  function handleConfirm() {
    const description = stops.filter(Boolean).join(' → ')
    onConfirm(amount, description)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15, color: 'var(--theme-text1)' }}>Calculate Transport Fare</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--theme-text3)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div>
          <label style={lbl}>Vehicle</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {VEHICLE_TYPES.map(v => (
              <button
                key={v.key}
                onClick={() => selectVehicle(v.key)}
                className={`tab-btn${vehicleKey === v.key ? ' tab-btn--active' : ''}`}
                style={{ flex: 1, fontSize: 12 }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stops.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: i === 0 ? 'var(--theme-accent)' : i === stops.length - 1 ? 'var(--theme-red)' : 'var(--theme-text3)',
              }} />
              <input
                style={{ ...inp, width: 'auto', flex: 1 }}
                placeholder={stopLabel(i, stops.length)}
                value={s}
                onChange={e => setStop(i, e.target.value)}
              />
              {stops.length > 2 && i !== 0 && i !== stops.length - 1 && (
                <button onClick={() => removeStop(i)} style={{ background: 'none', border: 'none', color: 'var(--theme-text3)', cursor: 'pointer', fontSize: 14 }}>✕</button>
              )}
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 11, alignSelf: 'flex-start' }} onClick={addStop}>+ Add stop</button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Distance (km)</label>
            <input style={inp} type="number" min="0" step="0.1" placeholder="0" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Rate / KM (NPR)</label>
            <input style={inp} type="number" min="0" step="0.5" placeholder="Set a rate" value={rate} onChange={e => setRate(e.target.value)} />
          </div>
        </div>

        <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--theme-green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Calculated Amount</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--theme-green)' }}>NPR {fmt(amount)}</div>
        </div>
        {vehicleRates[vehicleKey] == null && (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--theme-amber)' }}>
            No Rate/KM set for {VEHICLE_TYPES.find(v => v.key === vehicleKey)?.label} yet — enter one above, or set a default from the Rate/KM row on the Claims page.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={!canConfirm} onClick={handleConfirm}>
            Use This Amount
          </button>
        </div>
      </div>
    </div>
  )
}
