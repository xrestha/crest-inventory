import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const BS_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra']

export default function Stock() {
  const { clientId } = useAuth()
  const [periods, setPeriods] = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [stockData, setStockData] = useState({}) // { item_id: { opening, closing, wastage } }
  const [purchases, setPurchases] = useState({}) // { item_id: total_qty }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [activeTab, setActiveTab] = useState('opening') // opening | closing | wastage
  const [filterCat, setFilterCat] = useState('all')
  const [search, setSearch] = useState('')
  const [saveAllLoading, setSaveAllLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (clientId) init() }, [clientId])

  async function init() {
    setLoading(true)
    const [{ data: p }, { data: i }, { data: c }] = await Promise.all([
      supabase.from('monthly_periods').select('*').eq('client_id', clientId).order('bs_year', { ascending: false }).order('bs_month', { ascending: false }),
      supabase.from('items').select('*, categories(name)').eq('client_id', clientId).eq('is_active', true).order('name'),
      supabase.from('categories').select('*').eq('client_id', clientId).order('sort_order')
    ])
    setPeriods(p || [])
    setItems(i || [])
    setCategories(c || [])
    const open = (p || []).find(x => x.status === 'open')
    if (open) {
      setSelectedPeriod(open)
      await loadStockData(open.id, i || [])
    }
    setLoading(false)
  }

  async function loadStockData(periodId, itemList) {
    const [{ data: opening }, { data: closing }, { data: wastages }, { data: purch }] = await Promise.all([
      supabase.from('opening_stock').select('*').eq('period_id', periodId),
      supabase.from('closing_stock').select('*').eq('period_id', periodId),
      supabase.from('wastages').select('item_id, qty').eq('period_id', periodId),
      supabase.from('purchase_entries').select('item_id, qty').eq('period_id', periodId)
    ])

    // Build stock data map
    const data = {}
    const items = itemList || []
    items.forEach(item => {
      data[item.id] = { opening: '', closing: '', wastage: '' }
    })
    ;(opening || []).forEach(r => { if (data[r.item_id]) data[r.item_id].opening = r.qty })
    ;(closing || []).forEach(r => { if (data[r.item_id]) data[r.item_id].closing = r.physical_qty })

    // Sum wastages per item
    const wastageMap = {}
    ;(wastages || []).forEach(r => {
      wastageMap[r.item_id] = (wastageMap[r.item_id] || 0) + parseFloat(r.qty)
    })
    Object.keys(wastageMap).forEach(id => {
      if (data[id]) data[id].wastage = wastageMap[id]
    })

    setStockData(data)

    // Sum purchases per item
    const purchMap = {}
    ;(purch || []).forEach(r => {
      purchMap[r.item_id] = (purchMap[r.item_id] || 0) + parseFloat(r.qty)
    })
    setPurchases(purchMap)
  }

  async function handlePeriodChange(periodId) {
    const p = periods.find(x => x.id === periodId)
    setSelectedPeriod(p)
    await loadStockData(periodId, items)
  }

  function updateField(itemId, field, value) {
    setStockData(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value }
    }))
  }

  async function saveRow(itemId) {
    setSaving(prev => ({ ...prev, [itemId]: true }))
    const row = stockData[itemId]

    if (activeTab === 'opening') {
      const qty = parseFloat(row.opening) || 0
      await supabase.from('opening_stock').upsert({
        period_id: selectedPeriod.id, item_id: itemId, qty
      }, { onConflict: 'period_id,item_id' })
    }

    if (activeTab === 'closing') {
      const qty = parseFloat(row.closing) || 0
      await supabase.from('closing_stock').upsert({
        period_id: selectedPeriod.id, item_id: itemId,
        physical_qty: qty, counted_at: new Date().toISOString()
      }, { onConflict: 'period_id,item_id' })
    }

    if (activeTab === 'wastage') {
      // Delete existing wastage for this item/period and re-insert as single record
      await supabase.from('wastages').delete()
        .eq('period_id', selectedPeriod.id).eq('item_id', itemId)
      const qty = parseFloat(row.wastage) || 0
      if (qty > 0) {
        await supabase.from('wastages').insert({
          period_id: selectedPeriod.id, item_id: itemId, qty
        })
      }
    }

    setSaving(prev => ({ ...prev, [itemId]: false }))
  }

  async function saveAll() {
    setSaveAllLoading(true)
    const visibleItems = filteredItems()
    for (const item of visibleItems) {
      await saveRow(item.id)
    }
    setSaveAllLoading(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function filteredItems() {
    return items.filter(item => {
      const matchCat = filterCat === 'all' || item.category_id === filterCat
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }

  // Calculate used qty: opening + purchased - closing - wastage
  function getUsed(itemId) {
    const row = stockData[itemId] || {}
    const opening = parseFloat(row.opening) || 0
    const purchased = parseFloat(purchases[itemId]) || 0
    const closing = parseFloat(row.closing) || 0
    const wastage = parseFloat(row.wastage) || 0
    return opening + purchased - closing - wastage
  }

  // Summary totals
  function getSummary() {
    const byCategory = {}
    categories.forEach(c => {
      const catItems = items.filter(i => i.category_id === c.id)
      const openingVal = catItems.reduce((sum, i) => {
        const qty = parseFloat(stockData[i.id]?.opening) || 0
        return sum + qty * parseFloat(i.per_uom_rate || 0)
      }, 0)
      const closingVal = catItems.reduce((sum, i) => {
        const qty = parseFloat(stockData[i.id]?.closing) || 0
        return sum + qty * parseFloat(i.per_uom_rate || 0)
      }, 0)
      byCategory[c.name] = { opening: openingVal, closing: closingVal }
    })
    return byCategory
  }

  const periodLabel = selectedPeriod
    ? `${BS_MONTHS[selectedPeriod.bs_month - 1]} ${selectedPeriod.bs_year}`
    : '—'

  const visible = filteredItems()

  const TABS = [
    { id: 'opening', label: 'Opening Stock', desc: 'Stock at start of month' },
    { id: 'closing', label: 'Closing Stock', desc: 'Physical count at month end' },
    { id: 'wastage', label: 'Wastage', desc: 'Spoilage & waste recorded' },
    { id: 'summary', label: 'Summary', desc: 'Full picture per item' },
  ]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Stock Count</h1>
          <p className="page-subtitle">Opening stock, physical closing count & wastage — {periodLabel}</p>
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
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #2a2f3d', paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 20px', fontSize: 13, fontWeight: 500,
              color: activeTab === tab.id ? '#c9a84c' : '#6b7280',
              borderBottom: activeTab === tab.id ? '2px solid #c9a84c' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.12s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div>
          {/* Category summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            {categories.map(c => {
              const summary = getSummary()
              const s = summary[c.name] || { opening: 0, closing: 0 }
              return (
                <div key={c.id} className="stat-card">
                  <div className="stat-label">{c.name}</div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
                    Opening: <span style={{ color: '#c9a84c' }}>NPR {s.opening.toLocaleString('en-NP', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>
                    Closing: <span style={{ color: '#34d399' }}>NPR {s.closing.toLocaleString('en-NP', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Full item summary table */}
          <div className="card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>UOM</th>
                    <th style={{ textAlign: 'right' }}>Opening</th>
                    <th style={{ textAlign: 'right' }}>Purchased</th>
                    <th style={{ textAlign: 'right' }}>Wastage</th>
                    <th style={{ textAlign: 'right' }}>Closing</th>
                    <th style={{ textAlign: 'right' }}>Used</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const row = stockData[item.id] || {}
                    const used = getUsed(item.id)
                    const hasData = row.opening !== '' || row.closing !== '' || purchases[item.id]
                    return (
                      <tr key={item.id} style={{ opacity: hasData ? 1 : 0.4 }}>
                        <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{item.name}</td>
                        <td><span className="badge badge-yellow">{item.categories?.name}</span></td>
                        <td style={{ color: '#6b7280' }}>{item.uom}</td>
                        <td style={{ textAlign: 'right' }}>{row.opening !== '' ? Number(row.opening).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', color: '#c9a84c' }}>{purchases[item.id] ? Number(purchases[item.id]).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', color: '#f87171' }}>{row.wastage ? Number(row.wastage).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', color: '#34d399' }}>{row.closing !== '' ? Number(row.closing).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: used < 0 ? '#f87171' : '#e8e0d0' }}>
                          {hasData ? Number(used).toLocaleString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Input Tabs: Opening / Closing / Wastage */}
      {activeTab !== 'summary' && (
        <>
          <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#c9a84c' }}>
            {TABS.find(t => t.id === activeTab)?.desc} — enter quantities in the item's UOM, then click Save All.
          </div>

          {/* Filters + Save All */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                style={{ background: '#181c27', border: '1px solid #2a2f3d', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#e8e0d0', outline: 'none', width: 200 }}
                placeholder="Search items…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select
                style={{ background: '#181c27', border: '1px solid #2a2f3d', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#e8e0d0', outline: 'none' }}
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={saveAll}
              disabled={saveAllLoading || selectedPeriod?.status === 'closed'}
            >
              {saveAllLoading ? 'Saving…' : saved ? '✓ Saved' : 'Save All'}
            </button>
          </div>

          <div className="card">
            {loading ? (
              <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>UOM</th>
                      {activeTab === 'summary' ? null : (
                        <>
                          <th style={{ textAlign: 'right', color: '#c9a84c' }}>
                            {activeTab === 'opening' ? 'Opening Qty' : activeTab === 'closing' ? 'Physical Count' : 'Wastage Qty'}
                          </th>
                          <th style={{ textAlign: 'right' }}>Purchased</th>
                          <th></th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(item => {
                      const row = stockData[item.id] || {}
                      const fieldKey = activeTab === 'opening' ? 'opening' : activeTab === 'closing' ? 'closing' : 'wastage'
                      const val = row[fieldKey]
                      const isSaving = saving[item.id]

                      return (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{item.name}</td>
                          <td><span className="badge badge-yellow">{item.categories?.name}</span></td>
                          <td style={{ textAlign: 'right', color: '#6b7280' }}>{item.uom}</td>
                          <td style={{ textAlign: 'right', width: 140 }}>
                            <input
                              type="number"
                              min="0"
                              value={val === '' ? '' : val}
                              onChange={e => updateField(item.id, fieldKey, e.target.value)}
                              onBlur={() => saveRow(item.id)}
                              placeholder="0"
                              disabled={selectedPeriod?.status === 'closed'}
                              style={{
                                background: '#0f1117', border: '1px solid #2a2f3d',
                                borderRadius: 5, padding: '6px 10px', fontSize: 13,
                                color: '#e8e0d0', outline: 'none', width: 110,
                                textAlign: 'right',
                                borderColor: val > 0 ? 'rgba(201,168,76,0.4)' : '#2a2f3d'
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', color: '#6b7280', fontSize: 13 }}>
                            {purchases[item.id] ? `${Number(purchases[item.id]).toLocaleString()} ${item.uom}` : '—'}
                          </td>
                          <td style={{ width: 40, textAlign: 'center' }}>
                            {isSaving && <span style={{ fontSize: 11, color: '#6b7280' }}>…</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
