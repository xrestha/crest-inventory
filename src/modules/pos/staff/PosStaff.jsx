import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../supabaseClient'
import Tip from '../../../components/Tip'

const ROLE_OPTIONS = [
  { value: '',           label: '— No POS Access —' },
  { value: 'staff',      label: 'Staff',             desc: 'Take orders, view floor, close bills' },
  { value: 'supervisor', label: 'Supervisor',         desc: 'Staff + table setup, void, open/close shift' },
  { value: 'manager',    label: 'Manager',            desc: 'Supervisor + reports, staff role assignment' },
]

const ROLE_BADGE = { staff: 'badge-green', supervisor: 'badge-amber', manager: 'badge-gold' }

export default function PosStaff() {
  const { clientId, isAdmin, hasPosAccess } = useAuth()
  const [staff,   setStaff]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState({})
  const [msg,     setMsg]     = useState('')

  const canEdit = isAdmin || hasPosAccess('manager')

  useEffect(() => { if (clientId) load() }, [clientId]) // eslint-disable-line

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, pos_role, last_seen_at')
      .eq('client_id', clientId)
      .eq('role', 'client')
      .order('full_name')
    setStaff(data || [])
    setLoading(false)
  }

  async function updateRole(profileId, newRole) {
    setSaving(s => ({ ...s, [profileId]: true }))
    setMsg('')
    const { error } = await supabase
      .from('profiles')
      .update({ pos_role: newRole || null })
      .eq('id', profileId)
    if (error) {
      setMsg('Error: ' + error.message)
    } else {
      setStaff(prev => prev.map(p => p.id === profileId ? { ...p, pos_role: newRole || null } : p))
    }
    setSaving(s => ({ ...s, [profileId]: false }))
  }

  if (!hasPosAccess('manager')) return <Navigate to="/pos/tables" replace />

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860 }}>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: 'var(--theme-text1)', fontSize: 20 }}>POS Staff</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--theme-text3)' }}>
          Assign POS roles to your team. Only users with a role assigned can access POS screens.
        </p>
      </div>

      {/* Role legend */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {ROLE_OPTIONS.slice(1).map(r => (
          <div key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={ROLE_BADGE[r.value]} style={{ fontSize: 11 }}>{r.label}</span>
            <span style={{ fontSize: 12, color: 'var(--theme-text3)' }}>{r.desc}</span>
          </div>
        ))}
      </div>

      {msg && (
        <p style={{ fontSize: 13, color: 'var(--theme-red)', marginBottom: 16 }}>{msg}</p>
      )}

      {loading ? (
        <p style={{ color: 'var(--theme-text3)' }}>Loading…</p>
      ) : staff.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--theme-text3)' }}>
          No staff accounts found. Accounts are created via the login / invite flow.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>
                  <Tip text="The access level this user has within Crest POS. No role = cannot see any POS screens.">POS Role</Tip>
                </th>
                <th>
                  <Tip text="Last time this user was active in the app">Last Seen</Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: 'var(--theme-text1)' }}>
                    {p.full_name || '—'}
                  </td>
                  <td>
                    {canEdit ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <select
                          className="form-select"
                          style={{ minWidth: 180 }}
                          value={p.pos_role || ''}
                          disabled={saving[p.id]}
                          onChange={e => updateRole(p.id, e.target.value)}
                        >
                          {ROLE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        {saving[p.id] && (
                          <span style={{ fontSize: 12, color: 'var(--theme-text3)' }}>Saving…</span>
                        )}
                      </div>
                    ) : (
                      p.pos_role
                        ? <span className={ROLE_BADGE[p.pos_role] || 'badge-gray'} style={{ fontSize: 11 }}>
                            {p.pos_role.charAt(0).toUpperCase() + p.pos_role.slice(1)}
                          </span>
                        : <span style={{ fontSize: 12, color: 'var(--theme-text3)' }}>No access</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--theme-text3)' }}>
                    {p.last_seen_at
                      ? new Date(p.last_seen_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canEdit && (
        <p style={{ fontSize: 12, color: 'var(--theme-text3)', marginTop: 16 }}>
          Role changes require Manager access. Contact your manager or Crest admin.
        </p>
      )}
    </div>
  )
}
