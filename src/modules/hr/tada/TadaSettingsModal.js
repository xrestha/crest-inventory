import { useState } from 'react'
import { supabase } from '../../../supabaseClient'

const inp = {
  background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)',
  borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--theme-text1)',
  outline: 'none', fontFamily: 'inherit',
}
const lbl = { fontSize: 11, color: 'var(--theme-text3)', marginBottom: 4, display: 'block' }
const VEHICLE_TYPES = [
  { key: '2w', label: '2-Wheeler' },
  { key: '4w', label: '4-Wheeler' },
  { key: 'ev', label: 'EV' },
]

// Admin/owner-only settings for TADA Claims — vehicle rates (used by the Calculate Transport
// Fare modal) and Purpose preset options (used by the New Claim form's Purpose dropdown). Edits
// are staged locally and written in one explicit Save, same convention as Table Management's
// Discount Reasons/Quick Notes tabs, rather than auto-saving per keystroke.
export default function TadaSettingsModal({ clientId, vehicleRates, purposeOptions, onClose, onSaved }) {
  const [rates, setRates] = useState({
    '2w': vehicleRates['2w'] != null ? String(vehicleRates['2w']) : '',
    '4w': vehicleRates['4w'] != null ? String(vehicleRates['4w']) : '',
    ev:   vehicleRates.ev   != null ? String(vehicleRates.ev)   : '',
  })
  const [options, setOptions] = useState(purposeOptions)
  const [newOption, setNewOption] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  function addOption() {
    const v = newOption.trim()
    if (!v || options.includes(v)) { setNewOption(''); return }
    setOptions(prev => [...prev, v])
    setNewOption('')
  }
  function removeOption(v) { setOptions(prev => prev.filter(x => x !== v)) }

  async function handleSave() {
    if (!clientId) return
    setSaving(true); setMsg('')
    const nextRates = {
      '2w': rates['2w'] === '' ? null : parseFloat(rates['2w']),
      '4w': rates['4w'] === '' ? null : parseFloat(rates['4w']),
      ev:   rates.ev   === '' ? null : parseFloat(rates.ev),
    }
    const { data: existing } = await supabase.from('settings').select('id').eq('client_id', clientId).maybeSingle()
    const payload = { tada_vehicle_rates: nextRates, tada_purpose_options: options }
    const { error } = existing
      ? await supabase.from('settings').update(payload).eq('id', existing.id)
      : await supabase.from('settings').insert({ client_id: clientId, ...payload })
    setSaving(false)
    if (error) { setMsg('error:' + error.message); return }
    onSaved(nextRates, options)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 270, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 460, maxHeight: '85vh', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--theme-text1)' }}>TADA Settings</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--theme-text3)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div>
          <label style={{ ...lbl, fontWeight: 700, fontSize: 12, color: 'var(--theme-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Rate / KM by Vehicle
          </label>
          <p style={{ margin: '2px 0 10px', fontSize: 12, color: 'var(--theme-text3)' }}>
            Used by the Transport line's Calculate Fare modal — Amount = Distance × the selected vehicle's rate.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            {VEHICLE_TYPES.map(v => (
              <div key={v.key} style={{ flex: 1 }}>
                <label style={lbl}>{v.label} (NPR)</label>
                <input
                  style={{ ...inp, width: '100%' }} type="number" min="0" step="0.5" placeholder="—"
                  value={rates[v.key]} onChange={e => setRates(r => ({ ...r, [v.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label style={{ ...lbl, fontWeight: 700, fontSize: 12, color: 'var(--theme-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Purpose Options
          </label>
          <p style={{ margin: '2px 0 10px', fontSize: 12, color: 'var(--theme-text3)' }}>
            Preset choices for the New Claim form's Purpose dropdown. "Other" is always available for a one-off trip.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              style={{ ...inp, flex: 1 }}
              value={newOption}
              onChange={e => setNewOption(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addOption()}
              placeholder="e.g. Vendor site visit"
            />
            <button className="btn btn-ghost" onClick={addOption}>+ Add</button>
          </div>
          {options.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--theme-text3)', fontSize: 12, border: '1px dashed var(--theme-border)', borderRadius: 6 }}>
              No purpose options yet — add common ones above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {options.map(o => (
                <span key={o} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px 5px 12px', borderRadius: 14, fontSize: 12,
                  background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)',
                  color: 'var(--theme-text1)',
                }}>
                  {o}
                  <button onClick={() => removeOption(o)} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--theme-text3)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {msg && (
          <p style={{ margin: 0, fontSize: 12, color: msg.startsWith('ok:') ? 'var(--theme-green)' : 'var(--theme-red)' }}>
            {msg.replace(/^(ok|error):/, '')}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        </div>
      </div>
    </div>
  )
}
