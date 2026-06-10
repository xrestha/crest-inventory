import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const EMPTY_FORM = { name: '', contact_person: '', phone: '' }

export default function Vendors() {
  const { profile } = useAuth()
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const clientId = profile?.client_id

  useEffect(() => { if (profile) loadVendors() }, [profile])

  async function loadVendors() {
    setLoading(true)
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('client_id', clientId)
      .order('name')
    setVendors(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(vendor) {
    setEditing(vendor.id)
    setForm({ name: vendor.name, contact_person: vendor.contact_person || '', phone: vendor.phone || '' })
    setError('')
    setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) { setError('Vendor name is required.'); return }
    setSaving(true)
    setError('')
    if (editing) {
      const { error } = await supabase.from('vendors').update({
        name: form.name.trim(),
        contact_person: form.contact_person.trim(),
        phone: form.phone.trim()
      }).eq('id', editing)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('vendors').insert({
        client_id: clientId,
        name: form.name.trim(),
        contact_person: form.contact_person.trim(),
        phone: form.phone.trim()
      })
      if (error) { setError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setShowForm(false)
    loadVendors()
  }

  async function toggleActive(vendor) {
    await supabase.from('vendors').update({ is_active: !vendor.is_active }).eq('id', vendor.id)
    loadVendors()
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Vendors</h1>
          <p className="page-subtitle">Manage your supplier list — linked to daily purchase entries</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Add Vendor</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 15, color: '#e8e0d0' }}>
            {editing ? 'Edit Vendor' : 'Add Vendor'}
          </h3>
          <div className="form-grid form-grid-3">
            <div className="form-field">
              <label>Vendor Name *</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Big Mart, Arawat Suppliers"
                autoFocus
              />
            </div>
            <div className="form-field">
              <label>Contact Person</label>
              <input
                value={form.contact_person}
                onChange={e => setForm({ ...form, contact_person: e.target.value })}
                placeholder="Name"
              />
            </div>
            <div className="form-field">
              <label>Phone</label>
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="98XXXXXXXX"
              />
            </div>
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update Vendor' : 'Add Vendor'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
        ) : vendors.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⊙</div>
            <p className="empty-state-text">No vendors yet. Add your suppliers to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendor Name</th>
                  <th>Contact Person</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{v.name}</td>
                    <td>{v.contact_person || <span style={{ color: '#4b5563' }}>—</span>}</td>
                    <td>{v.phone || <span style={{ color: '#4b5563' }}>—</span>}</td>
                    <td>
                      <span className={`badge ${v.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {v.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
                        onClick={() => openEdit(v)}>
                        Edit
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
                        onClick={() => toggleActive(v)}>
                        {v.is_active ? 'Deactivate' : 'Activate'}
                      </button>
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
