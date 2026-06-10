import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const DEFAULT_CATEGORIES = [
  'Kitchen Production',
  'Dairy & Bakery',
  'Meats & Poultry',
  'Groceries',
  'Veg & Fruits',
  'Beverage',
  'Misc. Items'
]

const UNITS = ['GM', 'ML', 'KG', 'LTR', 'PCS', 'PKT', 'BTL', 'BOX', 'ROLL', 'BUNCH', 'JAR']

const EMPTY_FORM = {
  name: '', category_id: '', uom: 'GM',
  purchase_qty: '', rate: ''
}

export default function Items() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [search, setSearch] = useState('')
  const [initingCats, setInitingCats] = useState(false)

  const clientId = profile?.client_id

  useEffect(() => { if (profile) init() }, [profile])

  async function init() {
    setLoading(true)
    await loadCategories()
    await loadItems()
    setLoading(false)
  }

  async function loadCategories() {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('client_id', clientId)
      .order('sort_order')
    setCategories(data || [])
    return data || []
  }

  async function loadItems() {
    const { data } = await supabase
      .from('items')
      .select('*, categories(name)')
      .eq('client_id', clientId)
      .order('name')
    setItems(data || [])
  }

  async function initDefaultCategories() {
    setInitingCats(true)
    const inserts = DEFAULT_CATEGORIES.map((name, i) => ({
      client_id: clientId, name, sort_order: i
    }))
    await supabase.from('categories').insert(inserts)
    const cats = await loadCategories()
    setInitingCats(false)
    return cats
  }

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id || '' })
    setError('')
    setShowForm(true)
  }

  function openEdit(item) {
    setEditing(item.id)
    setForm({
      name: item.name,
      category_id: item.category_id || '',
      uom: item.uom,
      purchase_qty: item.purchase_qty,
      rate: item.rate
    })
    setError('')
    setShowForm(true)
  }

  function f(val) { return { ...form, ...val } }

  async function save() {
    if (!form.name.trim()) { setError('Item name is required.'); return }
    if (!form.purchase_qty || !form.rate) { setError('Purchase qty and rate are required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      name: form.name.trim().toUpperCase(),
      category_id: form.category_id || null,
      uom: form.uom,
      purchase_qty: parseFloat(form.purchase_qty),
      rate: parseFloat(form.rate)
    }
    if (editing) {
      const { error } = await supabase.from('items').update(payload).eq('id', editing)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('items').insert({ ...payload, client_id: clientId })
      if (error) { setError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setShowForm(false)
    loadItems()
  }

  async function toggleActive(item) {
    await supabase.from('items').update({ is_active: !item.is_active }).eq('id', item.id)
    loadItems()
  }

  const perUom = (qty, rate) => qty && rate ? (rate / qty).toFixed(4) : '—'

  const filtered = items.filter(item => {
    const matchCat = filterCat === 'all' || item.category_id === filterCat
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Item Master</h1>
          <p className="page-subtitle">{items.length} ingredients across {categories.length} categories</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {categories.length === 0 && (
            <button className="btn btn-ghost" onClick={initDefaultCategories} disabled={initingCats}>
              {initingCats ? 'Setting up…' : '⚡ Load Default Categories'}
            </button>
          )}
          <button className="btn btn-primary" onClick={openNew}>+ Add Item</button>
        </div>
      </div>

      {categories.length === 0 && !loading && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(201,168,76,0.3)' }}>
          <p style={{ color: '#c9a84c', fontSize: 13, margin: 0 }}>
            No categories found. Click <strong>⚡ Load Default Categories</strong> to set up your 7 standard categories matching your Excel structure.
          </p>
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 15, color: '#e8e0d0' }}>
            {editing ? 'Edit Item' : 'Add Item'}
          </h3>
          <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 16 }}>
            <div className="form-field">
              <label>Item Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f({ name: e.target.value }))}
                placeholder="e.g. CHICKEN BREAST"
                autoFocus
              />
            </div>
            <div className="form-field">
              <label>Category</label>
              <select value={form.category_id} onChange={e => setForm(f({ category_id: e.target.value }))}>
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>UOM</label>
              <select value={form.uom} onChange={e => setForm(f({ uom: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Purchase Qty</label>
              <input
                type="number"
                value={form.purchase_qty}
                onChange={e => setForm(f({ purchase_qty: e.target.value }))}
                placeholder="1000"
              />
            </div>
            <div className="form-field">
              <label>Rate (NPR)</label>
              <input
                type="number"
                value={form.rate}
                onChange={e => setForm(f({ rate: e.target.value }))}
                placeholder="500"
              />
            </div>
          </div>
          {form.purchase_qty && form.rate && (
            <p style={{ fontSize: 12, color: '#c9a84c', margin: '10px 0 0' }}>
              Per {form.uom} rate: NPR {perUom(form.purchase_qty, form.rate)}
            </p>
          )}
          {error && <p style={{ color: '#f87171', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          style={{
            background: '#181c27', border: '1px solid #2a2f3d', borderRadius: 6,
            padding: '8px 12px', fontSize: 13, color: '#e8e0d0', outline: 'none', width: 220
          }}
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          style={{
            background: '#181c27', border: '1px solid #2a2f3d', borderRadius: 6,
            padding: '8px 12px', fontSize: 13, color: '#e8e0d0', outline: 'none'
          }}
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="card">
        {loading ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">≡</div>
            <p className="empty-state-text">
              {items.length === 0
                ? 'No items yet. Add your first ingredient to get started.'
                : 'No items match your search.'}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>UOM</th>
                  <th style={{ textAlign: 'right' }}>Purchase Qty</th>
                  <th style={{ textAlign: 'right' }}>Rate (NPR)</th>
                  <th style={{ textAlign: 'right' }}>Per UOM Rate</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{item.name}</td>
                    <td>
                      {item.categories?.name
                        ? <span className="badge badge-yellow">{item.categories.name}</span>
                        : <span style={{ color: '#4b5563' }}>—</span>}
                    </td>
                    <td>{item.uom}</td>
                    <td style={{ textAlign: 'right' }}>{Number(item.purchase_qty).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{Number(item.rate).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#c9a84c' }}>
                      {Number(item.per_uom_rate).toFixed(4)}
                    </td>
                    <td>
                      <span className={`badge ${item.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                        onClick={() => openEdit(item)}>Edit</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                        onClick={() => toggleActive(item)}>
                        {item.is_active ? 'Hide' : 'Show'}
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
