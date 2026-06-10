import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const BS_MONTHS = [
  'Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin',
  'Kartik','Mangsir','Poush','Magh','Falgun','Chaitra'
]

export default function Periods() {
  const { profile } = useAuth()
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ bs_year: 2082, bs_month: 1 })
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const clientId = profile?.client_id

  useEffect(() => {
    if (profile) loadPeriods()
  }, [profile])

  async function loadPeriods() {
    setLoading(true)
    const { data } = await supabase
      .from('monthly_periods')
      .select('*')
      .eq('client_id', clientId)
      .order('bs_year', { ascending: false })
      .order('bs_month', { ascending: false })
    setPeriods(data || [])
    setLoading(false)
  }

  async function createPeriod() {
    setError('')
    setCreating(true)
    const { error } = await supabase.from('monthly_periods').insert({
      client_id: clientId,
      bs_year: parseInt(form.bs_year),
      bs_month: parseInt(form.bs_month),
      status: 'open'
    })
    if (error) {
      setError(error.message.includes('unique') ? 'A period for this month already exists.' : error.message)
    } else {
      setShowForm(false)
      loadPeriods()
    }
    setCreating(false)
  }

  async function closePeriod(id) {
    if (!window.confirm('Close this period? It will be locked for editing.')) return
    await supabase.from('monthly_periods').update({ status: 'closed' }).eq('id', id)
    loadPeriods()
  }

  async function reopenPeriod(id) {
    await supabase.from('monthly_periods').update({ status: 'open' }).eq('id', id)
    loadPeriods()
  }

  const openCount = periods.filter(p => p.status === 'open').length

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Periods</h1>
          <p className="page-subtitle">One period per BS month — all inventory entries are linked to a period</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setError('') }}>
          + New Period
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 15, color: '#e8e0d0' }}>Create Period</h3>
          <div className="form-grid form-grid-2" style={{ maxWidth: 400 }}>
            <div className="form-field">
              <label>BS Year</label>
              <input
                type="number"
                value={form.bs_year}
                onChange={e => setForm({ ...form, bs_year: e.target.value })}
                min="2070" max="2100"
              />
            </div>
            <div className="form-field">
              <label>BS Month</label>
              <select value={form.bs_month} onChange={e => setForm({ ...form, bs_month: e.target.value })}>
                {BS_MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{i + 1} — {m}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={createPeriod} disabled={creating}>
              {creating ? 'Creating…' : 'Create Period'}
            </button>
          </div>
        </div>
      )}

      {openCount > 1 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(251,191,36,0.3)' }}>
          <p style={{ color: '#fbbf24', fontSize: 13, margin: 0 }}>
            ⚠ You have {openCount} open periods. It's recommended to keep only one open at a time.
          </p>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
        ) : periods.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">◷</div>
            <p className="empty-state-text">No periods yet. Create one to start tracking inventory.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>BS Year</th>
                  <th>BS Month</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {periods.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: '#e8e0d0' }}>
                      {BS_MONTHS[p.bs_month - 1]} {p.bs_year}
                    </td>
                    <td>{p.bs_year}</td>
                    <td>{BS_MONTHS[p.bs_month - 1]}</td>
                    <td>
                      <span className={`badge ${p.status === 'open' ? 'badge-green' : 'badge-gray'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ color: '#6b7280' }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {p.status === 'open' ? (
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={() => closePeriod(p.id)}>
                          Close Period
                        </button>
                      ) : (
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={() => reopenPeriod(p.id)}>
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
