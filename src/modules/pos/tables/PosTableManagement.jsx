import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../supabaseClient'
import Fab from '../../../components/Fab'
import Modal from '../../../components/Modal'
import Tip from '../../../components/Tip'

const STATUS_CYCLE = ['available', 'reserved', 'occupied', 'inactive']
const STATUS_BADGE = { available: 'badge-green', occupied: 'badge-red', reserved: 'badge-amber', inactive: 'badge-gray' }
const STATUS_LABEL = { available: 'Available', occupied: 'Occupied', reserved: 'Reserved', inactive: 'Inactive' }

const QS_EMPTY  = { prefix: 'Table', start: 1, count: 10, section: '', capacity: 4 }
const ADD_EMPTY = { name: '', section: '', capacity: 4 }

export default function PosTableManagement() {
  const { clientId, hasPosAccess } = useAuth()

  const [tables,   setTables]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [secFilter, setSecFilter] = useState('All')

  // Quick Setup
  const [qsOpen,   setQsOpen]   = useState(false)
  const [qs,       setQs]       = useState(QS_EMPTY)
  const [qsSaving, setQsSaving] = useState(false)
  const [qsMsg,    setQsMsg]    = useState('')

  // Add / Edit modal
  const [modal,   setModal]   = useState(false)
  const [target,  setTarget]  = useState(null)
  const [form,    setForm]    = useState(ADD_EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  useEffect(() => { if (clientId) load() }, [clientId]) // eslint-disable-line

  if (!hasPosAccess('supervisor')) return <Navigate to="/pos" replace />

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('pos_tables').select('*').eq('client_id', clientId)
      .order('sort_order').order('name')
    const rows = data || []
    setTables(rows)
    if (rows.length === 0) setQsOpen(true)  // auto-expand on first visit
    setLoading(false)
  }

  const existingSections = Array.from(new Set(tables.map(t => t.section).filter(Boolean)))
  const sections  = ['All', ...existingSections]
  const visible   = secFilter === 'All' ? tables : tables.filter(t => t.section === secFilter)
  const counts    = {
    available: tables.filter(t => t.status === 'available').length,
    occupied:  tables.filter(t => t.status === 'occupied').length,
    reserved:  tables.filter(t => t.status === 'reserved').length,
  }

  // ── Quick Setup ─────────────────────────────────────────────────────────────

  function qsPreview() {
    const n = Math.max(0, parseInt(qs.count, 10) || 0)
    const s = parseInt(qs.start, 10) || 1
    const p = qs.prefix.trim() || 'Table'
    if (n === 0) return '—'
    if (n <= 5) return Array.from({ length: n }, (_, i) => `${p} ${s + i}`).join(', ')
    return `${p} ${s}, ${p} ${s + 1}, ${p} ${s + 2} … ${p} ${s + n - 1}`
  }

  async function handleGenerate() {
    const count = parseInt(qs.count, 10) || 0
    const start = parseInt(qs.start, 10) || 1
    if (!qs.prefix.trim()) { setQsMsg('error:Prefix is required.'); return }
    if (count < 1 || count > 50) { setQsMsg('error:Count must be 1–50.'); return }
    if (!clientId) return
    setQsSaving(true); setQsMsg('')
    const rows = Array.from({ length: count }, (_, i) => ({
      client_id:  clientId,
      name:       `${qs.prefix.trim()} ${start + i}`,
      section:    qs.section.trim() || null,
      capacity:   parseInt(qs.capacity, 10) || 4,
      sort_order: start + i,
    }))
    const { error } = await supabase.from('pos_tables').insert(rows)
    if (error) { setQsMsg('error:' + error.message); setQsSaving(false); return }
    await load()
    setQsMsg(`ok:Created ${count} table${count !== 1 ? 's' : ''}.`)
    setQsSaving(false)
    setQs(QS_EMPTY)
  }

  // ── Add / Edit ───────────────────────────────────────────────────────────────

  function openAdd() {
    setTarget(null)
    setForm({ ...ADD_EMPTY })
    setMsg(''); setModal(true)
  }
  function openEdit(t) {
    setTarget(t)
    setForm({ name: t.name, section: t.section || '', capacity: t.capacity ?? 4, sort_order: t.sort_order ?? 0 })
    setMsg(''); setModal(true)
  }
  function closeModal() { setModal(false); setTarget(null) }

  async function handleSave() {
    if (!form.name.trim()) { setMsg('error:Table name is required.'); return }
    if (!clientId) return
    setSaving(true); setMsg('')
    const payload = {
      client_id:  clientId,
      name:       form.name.trim(),
      section:    form.section.trim() || null,
      capacity:   parseInt(form.capacity, 10) || 4,
      ...(target ? { sort_order: parseInt(form.sort_order, 10) || 0 } : {}),
    }
    const { error } = target
      ? await supabase.from('pos_tables').update(payload).eq('id', target.id)
      : await supabase.from('pos_tables').insert(payload)
    if (error) { setMsg('error:' + error.message); setSaving(false); return }
    await load(); closeModal(); setSaving(false)
  }

  async function handleDelete() {
    if (!target || !window.confirm(`Delete "${target.name}"? This cannot be undone.`)) return
    await supabase.from('pos_tables').delete().eq('id', target.id)
    await load(); closeModal()
  }

  async function cycleStatus(t, e) {
    e.stopPropagation()
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(t.status) + 1) % STATUS_CYCLE.length]
    await supabase.from('pos_tables').update({ status: next }).eq('id', t.id)
    setTables(prev => prev.map(r => r.id === t.id ? { ...r, status: next } : r))
  }

  async function handleStatusChange(val) {
    await supabase.from('pos_tables').update({ status: val }).eq('id', target.id)
    setTables(prev => prev.map(r => r.id === target.id ? { ...r, status: val } : r))
    setTarget(t => ({ ...t, status: val }))
  }

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: 'var(--theme-text1)', fontSize: 20 }}>Table Management</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--theme-text3)' }}>
          Set up your floor plan. Click a status badge on any card to cycle it instantly.
        </p>
      </div>

      {/* ── Quick Setup panel ── */}
      <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
        <button
          onClick={() => { setQsOpen(o => !o); setQsMsg('') }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '13px 18px', background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--theme-text1)', fontFamily: 'inherit',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
            <span style={{ color: 'var(--theme-accent)' }}>⚡</span> Quick Setup
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--theme-text3)' }}>
              — generate a batch of tables in one click
            </span>
          </span>
          <span style={{ fontSize: 10, color: 'var(--theme-text3)', transform: qsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
        </button>

        {qsOpen && (
          <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--theme-border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 2fr 80px', gap: 10, marginTop: 14, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--theme-text3)', display: 'block', marginBottom: 4 }}>
                  Prefix <Tip text="The name prefix — each table will be Prefix + number, e.g. 'Table 1', 'Bar 1'" />
                </label>
                <input className="form-select" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={qs.prefix} onChange={e => setQs(q => ({ ...q, prefix: e.target.value }))} placeholder="e.g. Table" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--theme-text3)', display: 'block', marginBottom: 4 }}>
                  Start # <Tip text="First table number — e.g. start at 1 for Table 1, or 11 to continue from Table 10" />
                </label>
                <input type="number" min="1" className="form-select" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={qs.start} onChange={e => setQs(q => ({ ...q, start: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--theme-text3)', display: 'block', marginBottom: 4 }}>
                  Count <Tip text="How many tables to create (max 50 at once)" />
                </label>
                <input type="number" min="1" max="50" className="form-select" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={qs.count} onChange={e => setQs(q => ({ ...q, count: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--theme-text3)', display: 'block', marginBottom: 4 }}>
                  Section <Tip text="Optional — groups these tables under a section tab (e.g. Main Hall, Bar, Outdoor)" />
                </label>
                <input className="form-select" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={qs.section} onChange={e => setQs(q => ({ ...q, section: e.target.value }))}
                  placeholder="e.g. Main Hall" list="qs-section-list" />
                <datalist id="qs-section-list">
                  {existingSections.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--theme-text3)', display: 'block', marginBottom: 4 }}>
                  Seats <Tip text="Default capacity for all tables in this batch — edit individual tables to adjust" />
                </label>
                <input type="number" min="1" className="form-select" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={qs.capacity} onChange={e => setQs(q => ({ ...q, capacity: e.target.value }))} />
              </div>
            </div>

            {/* Preview */}
            <p style={{ fontSize: 12, color: 'var(--theme-text3)', margin: '0 0 14px', fontStyle: 'italic' }}>
              Will create: <span style={{ color: 'var(--theme-text2)', fontStyle: 'normal' }}>{qsPreview()}</span>
              {parseInt(qs.count, 10) > 0 && (
                <span style={{ color: 'var(--theme-accent)', marginLeft: 6 }}>({parseInt(qs.count, 10)} tables)</span>
              )}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleGenerate} disabled={qsSaving}>
                {qsSaving ? 'Creating…' : `Generate ${parseInt(qs.count, 10) || 0} Tables`}
              </button>
              {qsMsg && (
                <span style={{ fontSize: 12, color: qsMsg.startsWith('error:') ? 'var(--theme-red)' : 'var(--theme-green)' }}>
                  {qsMsg.replace(/^(error|ok):/, '')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stat cards */}
      {tables.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          {[
            { label: 'Total Tables', value: tables.length,    color: 'var(--theme-text1)', tip: null },
            { label: 'Available',    value: counts.available, color: 'var(--theme-green)',  tip: 'Tables ready to seat a new party right now' },
            { label: 'Occupied',     value: counts.occupied,  color: 'var(--theme-red)',    tip: 'Tables with an active order currently open' },
            { label: 'Reserved',     value: counts.reserved,  color: 'var(--theme-amber)',  tip: 'Tables held for an upcoming booking or walk-in queue' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '12px 18px' }}>
              <div style={{ fontSize: 11, color: 'var(--theme-text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {s.tip ? <Tip text={s.tip}>{s.label}</Tip> : s.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Section filter */}
      {sections.length > 1 && (
        <div className="tab-bar" style={{ marginBottom: 20 }}>
          {sections.map(s => (
            <button key={s} className={`tab-btn${secFilter === s ? ' tab-btn--active' : ''}`} onClick={() => setSecFilter(s)}>{s}</button>
          ))}
        </div>
      )}

      {/* Floor grid */}
      {loading ? (
        <p style={{ color: 'var(--theme-text3)' }}>Loading…</p>
      ) : visible.length === 0 && tables.length > 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--theme-text3)' }}>
          No tables in this section.
        </div>
      ) : tables.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
          {visible.map(t => (
            <div
              key={t.id}
              className="card"
              onClick={() => openEdit(t)}
              style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--theme-text1)', lineHeight: 1.2 }}>{t.name}</span>
                <Tip text="Click to cycle: Available → Reserved → Occupied → Inactive. When orders are built, Occupied will set automatically when a bill is opened on this table.">
                  <span
                    className={STATUS_BADGE[t.status] || 'badge-gray'}
                    style={{ fontSize: 10, flexShrink: 0, cursor: 'pointer', borderBottom: 'none' }}
                    onClick={e => cycleStatus(t, e)}
                  >
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                </Tip>
              </div>
              {t.section && <div style={{ fontSize: 11, color: 'var(--theme-text3)' }}>{t.section}</div>}
              <div style={{ fontSize: 12, color: 'var(--theme-text2)' }}>
                <Tip text="Seating capacity — edit the table to change it">👥 {t.capacity} seats</Tip>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Fab show={tables.length > 0} onClick={openAdd} />

      {/* Add / Edit modal */}
      {modal && (
        <Modal onClose={closeModal}>
          <h3 style={{ margin: '0 0 18px', color: 'var(--theme-text1)' }}>
            {target ? `Edit — ${target.name}` : 'Add Table'}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--theme-text2)', display: 'block', marginBottom: 5 }}>
                Table Name <span style={{ color: 'var(--theme-red)' }}>*</span>{' '}
                <Tip text="Displayed on the floor plan and on bills — e.g. Table 1, Bar 3, Patio A" />
              </label>
              <input
                className="form-select" style={{ width: '100%', boxSizing: 'border-box' }}
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Table 1" autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--theme-text2)', display: 'block', marginBottom: 5 }}>
                  Section <Tip text="Groups tables by area — type a new name or pick an existing one. Leave blank for single-area setups." />
                </label>
                <input
                  style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)', borderRadius: 6, color: 'var(--theme-text1)', fontSize: 13, outline: 'none' }}
                  value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
                  placeholder="e.g. Indoor, Outdoor, Bar…" list="modal-section-list"
                />
                <datalist id="modal-section-list">
                  {existingSections.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--theme-text2)', display: 'block', marginBottom: 5 }}>
                  Capacity <Tip text="Number of seats" />
                </label>
                <input type="number" min="1" className="form-select" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
              </div>
            </div>

            {/* Sort order only shown when editing */}
            {target && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--theme-text2)', display: 'block', marginBottom: 5 }}>
                    Status <Tip text="Available = ready to seat. Occupied = active order. Reserved = booking. Inactive = out of service." />
                  </label>
                  <select className="form-select" style={{ width: '100%' }}
                    value={target.status} onChange={e => handleStatusChange(e.target.value)}>
                    {STATUS_CYCLE.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--theme-text2)', display: 'block', marginBottom: 5 }}>
                    Sort Order <Tip text="Lower numbers appear first within a section" />
                  </label>
                  <input type="number" min="0" className="form-select" style={{ width: '100%', boxSizing: 'border-box' }}
                    value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
                </div>
              </div>
            )}

            {msg && (
              <p style={{ margin: 0, fontSize: 12, color: msg.startsWith('error:') ? 'var(--theme-red)' : 'var(--theme-green)' }}>
                {msg.replace(/^(error|ok):/, '')}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              {target && (
                <button className="btn btn-ghost"
                  style={{ color: 'var(--theme-red)', borderColor: 'var(--theme-red)', marginRight: 'auto' }}
                  onClick={handleDelete}>Delete</button>
              )}
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : target ? 'Save Changes' : 'Add Table'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
