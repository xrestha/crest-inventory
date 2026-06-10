import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const EMPTY_CLIENT = { name: '', location: '', contact_person: '', contact_phone: '' }
const EMPTY_USER = { email: '', password: '', full_name: '' }

export default function AdminClients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showClientForm, setShowClientForm] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT)
  const [userForm, setUserForm] = useState(EMPTY_USER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editing, setEditing] = useState(null)
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('name')
    setClients(data || [])
    setLoading(false)
  }

  async function loadUsers(clientId) {
    setLoadingUsers(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('client_id', clientId)
    setUsers(data || [])
    setLoadingUsers(false)
  }

  function openNewClient() {
    setEditing(null)
    setClientForm(EMPTY_CLIENT)
    setError('')
    setSuccess('')
    setShowClientForm(true)
    setShowUserForm(false)
    setSelectedClient(null)
  }

  function openEditClient(client) {
    setEditing(client.id)
    setClientForm({
      name: client.name,
      location: client.location || '',
      contact_person: client.contact_person || '',
      contact_phone: client.contact_phone || ''
    })
    setError('')
    setSuccess('')
    setShowClientForm(true)
    setShowUserForm(false)
  }

  async function saveClient() {
    if (!clientForm.name.trim()) { setError('Client name is required.'); return }
    setSaving(true)
    setError('')
    if (editing) {
      const { error } = await supabase.from('clients').update({
        name: clientForm.name.trim(),
        location: clientForm.location.trim(),
        contact_person: clientForm.contact_person.trim(),
        contact_phone: clientForm.contact_phone.trim()
      }).eq('id', editing)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('clients').insert({
        name: clientForm.name.trim(),
        location: clientForm.location.trim(),
        contact_person: clientForm.contact_person.trim(),
        contact_phone: clientForm.contact_phone.trim()
      })
      if (error) { setError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setShowClientForm(false)
    setEditing(null)
    loadClients()
  }

  function openAddUser(client) {
    setSelectedClient(client)
    setUserForm(EMPTY_USER)
    setError('')
    setSuccess('')
    setShowUserForm(true)
    setShowClientForm(false)
    loadUsers(client.id)
  }

  async function createUser() {
    if (!userForm.email.trim() || !userForm.password.trim()) {
      setError('Email and password are required.')
      return
    }
    if (userForm.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')

    // Create user directly in auth.users (bypasses invite flow)
    const { data, error: authError } = await supabase.rpc('create_client_user', {
      p_email: userForm.email.trim(),
      p_password: userForm.password.trim(),
      p_full_name: userForm.full_name.trim(),
      p_client_id: selectedClient.id
    })

    if (authError) {
      // Fallback: guide admin to create via SQL
      setError(`Could not create user automatically. Please create via Supabase SQL Editor using the instructions below.`)
      setSaving(false)
      return
    }

    setSuccess(`User ${userForm.email} created successfully.`)
    setUserForm(EMPTY_USER)
    setSaving(false)
    loadUsers(selectedClient.id)
  }

  // Generate SQL for manual user creation
  function getSqlForUser() {
    return `-- Run in Supabase SQL Editor to create this client user:
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
VALUES (
  gen_random_uuid(),
  '${userForm.email}',
  crypt('${userForm.password || 'changeme123'}', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"${userForm.full_name}"}',
  false, 'authenticated'
);

-- Then link to client:
UPDATE profiles 
SET client_id = '${selectedClient?.id}',
    full_name = '${userForm.full_name}'
WHERE id = (SELECT id FROM auth.users WHERE email = '${userForm.email}');`
  }

  async function toggleClientActive(client) {
    await supabase.from('clients').update({ is_active: !client.is_active }).eq('id', client.id)
    loadClients()
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">{clients.length} propert{clients.length !== 1 ? 'ies' : 'y'} on the platform</p>
        </div>
        <button className="btn btn-primary" onClick={openNewClient}>+ New Client</button>
      </div>

      {/* Client Form */}
      {showClientForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 15, color: '#e8e0d0' }}>
            {editing ? 'Edit Client' : 'New Client'}
          </h3>
          <div className="form-grid form-grid-2">
            <div className="form-field">
              <label>Property / Restaurant Name *</label>
              <input
                value={clientForm.name}
                onChange={e => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="e.g. Casa Acai Cafe"
                autoFocus
              />
            </div>
            <div className="form-field">
              <label>Location</label>
              <input
                value={clientForm.location}
                onChange={e => setClientForm({ ...clientForm, location: e.target.value })}
                placeholder="e.g. Jhamsikhel, Kathmandu"
              />
            </div>
            <div className="form-field">
              <label>Contact Person</label>
              <input
                value={clientForm.contact_person}
                onChange={e => setClientForm({ ...clientForm, contact_person: e.target.value })}
                placeholder="Owner / Manager name"
              />
            </div>
            <div className="form-field">
              <label>Phone</label>
              <input
                value={clientForm.contact_phone}
                onChange={e => setClientForm({ ...clientForm, contact_phone: e.target.value })}
                placeholder="98XXXXXXXX"
              />
            </div>
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => { setShowClientForm(false); setEditing(null) }}>Cancel</button>
            <button className="btn btn-primary" onClick={saveClient} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update Client' : 'Create Client'}
            </button>
          </div>
        </div>
      )}

      {/* Add User Form */}
      {showUserForm && selectedClient && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(201,168,76,0.25)' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#e8e0d0' }}>
            Add User — {selectedClient.name}
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 20px' }}>
            Creates a login for this client property
          </p>

          <div className="form-grid form-grid-3" style={{ marginBottom: 16 }}>
            <div className="form-field">
              <label>Full Name</label>
              <input
                value={userForm.full_name}
                onChange={e => setUserForm({ ...userForm, full_name: e.target.value })}
                placeholder="e.g. Ram Sharma"
                autoFocus
              />
            </div>
            <div className="form-field">
              <label>Email *</label>
              <input
                type="email"
                value={userForm.email}
                onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                placeholder="user@restaurant.com"
              />
            </div>
            <div className="form-field">
              <label>Password *</label>
              <input
                type="text"
                value={userForm.password}
                onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                placeholder="min 6 characters"
              />
            </div>
          </div>

          {/* SQL fallback — always show so admin can always create users */}
          <div style={{
            background: '#0f1117', border: '1px solid #2a2f3d', borderRadius: 6,
            padding: 14, marginBottom: 16
          }}>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              SQL to run in Supabase → SQL Editor
            </p>
            <pre style={{ fontSize: 11, color: '#9ca3af', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {getSqlForUser()}
            </pre>
          </div>

          {error && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
          {success && <p style={{ color: '#34d399', fontSize: 13, margin: '0 0 12px' }}>{success}</p>}

          {/* Existing users for this client */}
          {users.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>Existing users:</p>
              {loadingUsers ? <p style={{ fontSize: 13, color: '#6b7280' }}>Loading…</p> : users.map(u => (
                <div key={u.id} style={{
                  fontSize: 13, color: '#d1d5db', padding: '6px 0',
                  borderBottom: '1px solid #1e2330'
                }}>
                  {u.full_name || '—'} · <span style={{ color: '#6b7280' }}>{u.role}</span>
                </div>
              ))}
            </div>
          )}

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setShowUserForm(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Clients Table */}
      <div className="card">
        {loading ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
        ) : clients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⊛</div>
            <p className="empty-state-text">No clients yet. Create your first property to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Property Name</th>
                  <th>Location</th>
                  <th>Contact Person</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{c.name}</td>
                    <td>{c.location || <span style={{ color: '#4b5563' }}>—</span>}</td>
                    <td>{c.contact_person || <span style={{ color: '#4b5563' }}>—</span>}</td>
                    <td>{c.contact_phone || <span style={{ color: '#4b5563' }}>—</span>}</td>
                    <td>
                      <span className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                          onClick={() => openEditClient(c)}>Edit</button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', color: '#c9a84c', borderColor: 'rgba(201,168,76,0.3)' }}
                          onClick={() => openAddUser(c)}>+ User</button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                          onClick={() => toggleClientActive(c)}>
                          {c.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
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
