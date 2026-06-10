import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const BS_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra']

const EMPTY_FORM = { item_id: '', vendor_id: '', bs_day: '', qty: '', rate: '', invoice_ref: '' }

export default function Purchases() {
  const { clientId } = useAuth()
  const [periods, setPeriods] = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [items, setItems] = useState([])
  const [vendors, setVendors] = useState([])
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterDay, setFilterDay] = useState('all')
  const [filterItem, setFilterItem] = useState('all')
  const [editingId, setEditingId] = useState(null)

  useEffect(() => { if (clientId) init() }, [clientId])

  async function init() {
    setLoading(true)
    const [{ data: p }, { data: i }, { data: v }] = await Promise.all([
      supabase.from('monthly_periods').select('*').eq('client_id', clientId).order('bs_year', { ascending: false }).order('bs_month', { ascending: false }),
      supabase.from('items').select('*, categories(name)').eq('client_id', clientId).eq('is_active', true).order('name'),
      supabase.from('vendors').select('*').eq('client_id', clientId).eq('is_active', true).order('name')
    ])
    setPeriods(p || [])
    setItems(i || [])
    setVendors(v || [])
    const open = (p || []).find(x => x.status === 'open')
    if (open) { setSelectedPeriod(open); await loadPurchases(open.id) }
    setLoading(false)
  }

  async function loadPurchases(periodId) {
    const { data } = await supabase
      .from('purchase_entries')
      .select('*, items(name, uom, categories(name)), vendors(name)')
      .eq('period_id', periodId)
      .order('bs_day')
      .order('created_at')
    setPurchases(data || [])
  }

  async function handlePeriodChange(periodId) {
    const p = periods.find(x => x.id === periodId)
    setSelectedPeriod(p)
    setFilterDay('all')
    setFilterItem('all')
    await loadPurchases(periodId)
  }

  function openNew() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, rate: '', bs_day: '' })
    setError('')
    setShowForm(true)
  }

  function openEdit(entry) {
    setEditingId(entry.id)
    setForm({
      item_id: entry.item_id,
      vendor_id: entry.vendor_id || '',
      bs_day: entry.bs_day,
      qty: entry.qty,
      rate: entry.rate,
      invoice_ref: entry.invoice_ref || ''
    })
    setError('')
    setShowForm(true)
  }

  // Auto-fill rate from item master when item is selected
  function handleItemChange(itemId) {
    const item = items.find(i => i.id === itemId)
    setForm(f => ({ ...f, item_id: itemId, rate: item ? item.rate : '' }))
  }

  async function save() {
    if (!form.item_id) { setError('Select an item.'); return }
    if (!form.bs_day || form.bs_day < 1 || form.bs_day > 32) { setError('Enter a valid day (1–32).'); return }
    if (!form.qty || parseFloat(form.qty) <= 0) { setError('Enter a valid quantity.'); return }
    if (!form.rate || parseFloat(form.rate) <= 0) { setError('Enter a valid rate.'); return }

    setSaving(true)
    setError('')

    const payload = {
      period_id: selectedPeriod.id,
      item_id: form.item_id,
      vendor_id: form.vendor_id || null,
      bs_day: parseInt(form.bs_day),
      qty: parseFloat(form.qty),
      rate: parseFloat(form.rate),
      invoice_ref: form.invoice_ref.trim() || null
    }

    if (editingId) {
      const { error } = await supabase.from('purchase_entries').update(payload).eq('id', editingId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('purchase_entries').insert(payload)
      if (error) { setError(error.message); setSaving(false); return }
    }

    setSaving(false)
    setShowForm(false)
    setEditingId(null)
    loadPurchases(selectedPeriod.id)
  }

  async function deleteEntry(id) {
    if (!window.confirm('Delete this purchase entry?')) return
    await supabase.from('purchase_entries').delete().eq('id', id)
    loadPurchases(selectedPeriod.id)
  }

  // Filtered purchases
  const filtered = purchases.filter(p => {
    const matchDay = filterDay === 'all' || p.bs_day === parseInt(filterDay)
    const matchItem = filterItem === 'all' || p.item_id === filterItem
    return matchDay && matchItem
  })

  // Summary stats
  const totalValue = filtered.reduce((sum, p) => sum + (p.qty * p.rate), 0)
  const uniqueDays = [...new Set(purchases.map(p => p.bs_day))].sort((a, b) => a - b)

  // Group by day for display
  const byDay = filtered.reduce((acc, p) => {
    const day = p.bs_day
    if (!acc[day]) acc[day] = []
    acc[day].push(p)
    return acc
  }, {})

  const periodLabel = selectedPeriod
    ? `${BS_MONTHS[selectedPeriod.bs_month - 1]} ${selectedPeriod.bs_year}`
    : '—'

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Purchases</h1>
          <p className="page-subtitle">Daily ingredient purchases — {periodLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            style={{ background: '#181c27', border: '1px solid #2a2f3d', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#e8e0d0', outline: 'none' }}
            value={selectedPeriod?.id || ''}
            onChange={e => handlePeriodChange(e.target.value)}
          >
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {BS_MONTHS[p.bs_month - 1]} {p.bs_year} {p.status === 'open' ? '(open)' : '(closed)'}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={openNew} disabled={!selectedPeriod || selectedPeriod.status === 'closed'}>
            + Add Purchase
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total Entries</div>
          <div className="stat-value">{purchases.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Days with Purchases</div>
          <div className="stat-value">{uniqueDays.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Filtered Value</div>
          <div className="stat-value gold" style={{ fontSize: 18 }}>
            NPR {totalValue.toLocaleString('en-NP', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Period Status</div>
          <div className="stat-value" style={{ fontSize: 16 }}>
            <span className={`badge ${selectedPeriod?.status === 'open' ? 'badge-green' : 'badge-gray'}`}>
              {selectedPeriod?.status || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 15, color: '#e8e0d0' }}>
            {editingId ? 'Edit Purchase Entry' : 'Add Purchase Entry'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 14 }}>
            <div className="form-field">
              <label>Item *</label>
              <select value={form.item_id} onChange={e => handleItemChange(e.target.value)}>
                <option value="">— Select item —</option>
                {items.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.categories?.name || 'Uncategorised'})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Vendor</label>
              <select value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
                <option value="">— None —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Day (BS) *</label>
              <input
                type="number" min="1" max="32"
                value={form.bs_day}
                onChange={e => setForm(f => ({ ...f, bs_day: e.target.value }))}
                placeholder="1–32"
              />
            </div>
            <div className="form-field">
              <label>Qty *</label>
              <input
                type="number"
                value={form.qty}
                onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="form-field">
              <label>Rate (NPR) *</label>
              <input
                type="number"
                value={form.rate}
                onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="form-field">
              <label>Invoice Ref</label>
              <input
                value={form.invoice_ref}
                onChange={e => setForm(f => ({ ...f, invoice_ref: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Live calculation */}
          {form.qty && form.rate && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(201,168,76,0.08)', borderRadius: 6, display: 'flex', gap: 24 }}>
              <span style={{ fontSize: 13, color: '#c9a84c' }}>
                Total: NPR {(parseFloat(form.qty) * parseFloat(form.rate)).toLocaleString('en-NP', { maximumFractionDigits: 2 })}
              </span>
              {form.item_id && (() => {
                const item = items.find(i => i.id === form.item_id)
                if (!item) return null
                const perUom = parseFloat(form.rate) / parseFloat(item.purchase_qty)
                return <span style={{ fontSize: 13, color: '#9ca3af' }}>Per {item.uom}: NPR {perUom.toFixed(4)}</span>
              })()}
            </div>
          )}

          {error && <p style={{ color: '#f87171', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update' : 'Add Entry'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          style={{ background: '#181c27', border: '1px solid #2a2f3d', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#e8e0d0', outline: 'none' }}
          value={filterDay}
          onChange={e => setFilterDay(e.target.value)}
        >
          <option value="all">All Days</option>
          {uniqueDays.map(d => <option key={d} value={d}>Day {d}</option>)}
        </select>
        <select
          style={{ background: '#181c27', border: '1px solid #2a2f3d', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#e8e0d0', outline: 'none' }}
          value={filterItem}
          onChange={e => setFilterItem(e.target.value)}
        >
          <option value="all">All Items</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {(filterDay !== 'all' || filterItem !== 'all') && (
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => { setFilterDay('all'); setFilterItem('all') }}>
            Clear Filters
          </button>
        )}
        <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}</span>
      </div>

      {/* Purchases Table — grouped by day */}
      <div className="card">
        {loading ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
        ) : purchases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">↓</div>
            <p className="empty-state-text">No purchases recorded yet. Click + Add Purchase to start.</p>
          </div>
        ) : Object.keys(byDay).length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-text">No entries match your filters.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Vendor</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th>UOM</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Invoice</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(byDay).sort((a, b) => a - b).map(day => (
                  byDay[day].map((entry, idx) => (
                    <tr key={entry.id}>
                      {idx === 0 && (
                        <td rowSpan={byDay[day].length} style={{
                          fontWeight: 700, color: '#c9a84c', fontSize: 14,
                          borderRight: '1px solid #2a2f3d', verticalAlign: 'top',
                          paddingTop: 14
                        }}>
                          {day}
                        </td>
                      )}
                      <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{entry.items?.name}</td>
                      <td>
                        {entry.items?.categories?.name
                          ? <span className="badge badge-yellow">{entry.items.categories.name}</span>
                          : <span style={{ color: '#4b5563' }}>—</span>}
                      </td>
                      <td style={{ color: '#9ca3af' }}>{entry.vendors?.name || <span style={{ color: '#4b5563' }}>—</span>}</td>
                      <td style={{ textAlign: 'right' }}>{Number(entry.qty).toLocaleString()}</td>
                      <td style={{ color: '#6b7280' }}>{entry.items?.uom}</td>
                      <td style={{ textAlign: 'right' }}>{Number(entry.rate).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: '#c9a84c', fontWeight: 600 }}>
                        {(entry.qty * entry.rate).toLocaleString('en-NP', { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ color: '#6b7280', fontSize: 12 }}>{entry.invoice_ref || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => openEdit(entry)}>Edit</button>
                          <button className="btn btn-danger" style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => deleteEntry(entry.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ))}
                {/* Totals row */}
                <tr style={{ borderTop: '2px solid #2a2f3d' }}>
                  <td colSpan={7} style={{ fontWeight: 700, color: '#9ca3af', paddingTop: 12 }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#c9a84c', fontSize: 15, paddingTop: 12 }}>
                    NPR {totalValue.toLocaleString('en-NP', { maximumFractionDigits: 0 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
