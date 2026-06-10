import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const BS_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra']

export default function Sales() {
  const { clientId } = useAuth()
  const [periods, setPeriods] = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [recipes, setRecipes] = useState([])
  const [sales, setSales] = useState({}) // { recipe_id: { day: qty } }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeDay, setActiveDay] = useState(1)
  const [viewMode, setViewMode] = useState('day') // day | summary

  useEffect(() => { if (clientId) init() }, [clientId])

  async function init() {
    setLoading(true)
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from('monthly_periods').select('*').eq('client_id', clientId).order('bs_year', { ascending: false }).order('bs_month', { ascending: false }),
      supabase.from('recipes').select('*').eq('client_id', clientId).eq('is_active', true).order('name')
    ])
    setPeriods(p || [])
    setRecipes(r || [])
    const open = (p || []).find(x => x.status === 'open')
    if (open) { setSelectedPeriod(open); await loadSales(open.id) }
    setLoading(false)
  }

  async function loadSales(periodId) {
    const { data } = await supabase.from('sales_entries').select('*').eq('period_id', periodId)
    const map = {}
    ;(data || []).forEach(s => {
      if (!map[s.recipe_id]) map[s.recipe_id] = {}
      map[s.recipe_id][s.bs_day] = s.qty_sold
    })
    setSales(map)
  }

  async function handlePeriodChange(periodId) {
    const p = periods.find(x => x.id === periodId)
    setSelectedPeriod(p)
    await loadSales(periodId)
  }

  function updateSale(recipeId, day, value) {
    setSales(prev => ({
      ...prev,
      [recipeId]: { ...(prev[recipeId] || {}), [day]: value }
    }))
  }

  async function saveDay() {
    if (!selectedPeriod) return
    setSaving(true)
    const upserts = []
    recipes.forEach(recipe => {
      const qty = parseFloat(sales[recipe.id]?.[activeDay]) || 0
      if (qty >= 0) {
        upserts.push({
          period_id: selectedPeriod.id,
          recipe_id: recipe.id,
          bs_day: activeDay,
          qty_sold: qty
        })
      }
    })
    if (upserts.length > 0) {
      await supabase.from('sales_entries').upsert(upserts, { onConflict: 'period_id,recipe_id,bs_day' })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Total sold per recipe for the period
  function totalSold(recipeId) {
    const days = sales[recipeId] || {}
    return Object.values(days).reduce((sum, q) => sum + (parseFloat(q) || 0), 0)
  }

  // Total revenue per recipe
  function totalRevenue(recipe) {
    return totalSold(recipe.id) * (parseFloat(recipe.selling_price) || 0)
  }

  const periodLabel = selectedPeriod
    ? `${BS_MONTHS[selectedPeriod.bs_month - 1]} ${selectedPeriod.bs_year}`
    : '—'

  const totalPeriodRevenue = recipes.reduce((sum, r) => sum + totalRevenue(r), 0)
  const totalPeriodCovers = recipes.reduce((sum, r) => sum + totalSold(r.id), 0)

  // Days that have any sales
  const daysWithSales = [...new Set(
    Object.values(sales).flatMap(dayMap => Object.keys(dayMap).map(Number).filter(d => parseFloat(dayMap[d]) > 0))
  )].sort((a, b) => a - b)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Sales Entry</h1>
          <p className="page-subtitle">Daily sales qty per menu item — {periodLabel}</p>
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

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total Covers</div>
          <div className="stat-value">{totalPeriodCovers.toLocaleString()}</div>
          <div className="stat-sub">Items sold this period</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Days Recorded</div>
          <div className="stat-value">{daysWithSales.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Period Revenue</div>
          <div className="stat-value gold" style={{ fontSize: 18 }}>
            NPR {totalPeriodRevenue.toLocaleString('en-NP', { maximumFractionDigits: 0 })}
          </div>
          <div className="stat-sub">Excl. VAT</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Recipes</div>
          <div className="stat-value">{recipes.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #2a2f3d' }}>
        {['day', 'summary'].map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 20px', fontSize: 13, fontWeight: 500,
            color: viewMode === mode ? '#c9a84c' : '#6b7280',
            borderBottom: viewMode === mode ? '2px solid #c9a84c' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.12s', textTransform: 'capitalize'
          }}>{mode === 'day' ? 'Daily Entry' : 'Period Summary'}</button>
        ))}
      </div>

      {/* DAILY ENTRY */}
      {viewMode === 'day' && (
        <>
          {/* Day selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#6b7280', marginRight: 4 }}>Day:</span>
            {Array.from({ length: 32 }, (_, i) => i + 1).map(day => {
              const hasSales = daysWithSales.includes(day)
              const isActive = activeDay === day
              return (
                <button key={day} onClick={() => setActiveDay(day)} style={{
                  background: isActive ? '#c9a84c' : hasSales ? 'rgba(201,168,76,0.12)' : '#181c27',
                  border: `1px solid ${isActive ? '#c9a84c' : hasSales ? 'rgba(201,168,76,0.3)' : '#2a2f3d'}`,
                  borderRadius: 5, padding: '5px 10px', fontSize: 12,
                  color: isActive ? '#0f1117' : hasSales ? '#c9a84c' : '#6b7280',
                  cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                  minWidth: 34, transition: 'all 0.1s'
                }}>{day}</button>
              )
            })}
          </div>

          <div className="card">
            {loading ? (
              <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
            ) : recipes.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-text">No active recipes. Add recipes in Recipe Costing first.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>
                    Entering sales for <strong style={{ color: '#c9a84c' }}>Day {activeDay}</strong> — {periodLabel}
                  </span>
                  <button className="btn btn-primary" onClick={saveDay} disabled={saving || selectedPeriod?.status === 'closed'}>
                    {saving ? 'Saving…' : saved ? '✓ Saved' : `Save Day ${activeDay}`}
                  </button>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Menu Item</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Selling Price</th>
                      <th style={{ textAlign: 'right', width: 130 }}>Qty Sold</th>
                      <th style={{ textAlign: 'right' }}>Day Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map(recipe => {
                      const qty = sales[recipe.id]?.[activeDay] ?? ''
                      const rev = (parseFloat(qty) || 0) * (parseFloat(recipe.selling_price) || 0)
                      return (
                        <tr key={recipe.id}>
                          <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{recipe.name}</td>
                          <td><span className="badge badge-yellow">{recipe.category}</span></td>
                          <td style={{ textAlign: 'right', color: '#6b7280' }}>
                            {recipe.selling_price ? `NPR ${Number(recipe.selling_price).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number" min="0"
                              value={qty}
                              onChange={e => updateSale(recipe.id, activeDay, e.target.value)}
                              placeholder="0"
                              disabled={selectedPeriod?.status === 'closed'}
                              style={{
                                background: '#0f1117', border: '1px solid #2a2f3d',
                                borderRadius: 5, padding: '6px 10px', fontSize: 13,
                                color: '#e8e0d0', outline: 'none', width: 90, textAlign: 'right',
                                borderColor: parseFloat(qty) > 0 ? 'rgba(201,168,76,0.4)' : '#2a2f3d'
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', color: rev > 0 ? '#c9a84c' : '#4b5563', fontWeight: rev > 0 ? 600 : 400 }}>
                            {rev > 0 ? `NPR ${rev.toLocaleString('en-NP', { maximumFractionDigits: 0 })}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </>
      )}

      {/* PERIOD SUMMARY */}
      {viewMode === 'summary' && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Menu Item</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Total Sold</th>
                  <th style={{ textAlign: 'right' }}>Selling Price</th>
                  <th style={{ textAlign: 'right' }}>Total Revenue</th>
                  <th style={{ textAlign: 'right' }}>% of Revenue</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map(recipe => {
                  const sold = totalSold(recipe.id)
                  const rev = totalRevenue(recipe)
                  const revPct = totalPeriodRevenue > 0 ? (rev / totalPeriodRevenue) * 100 : 0
                  return (
                    <tr key={recipe.id} style={{ opacity: sold === 0 ? 0.4 : 1 }}>
                      <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{recipe.name}</td>
                      <td><span className="badge badge-yellow">{recipe.category}</span></td>
                      <td style={{ textAlign: 'right', color: sold > 0 ? '#e8e0d0' : '#4b5563' }}>
                        {sold > 0 ? sold.toLocaleString() : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: '#6b7280' }}>
                        {recipe.selling_price ? `NPR ${Number(recipe.selling_price).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: rev > 0 ? '#c9a84c' : '#4b5563', fontWeight: 600 }}>
                        {rev > 0 ? `NPR ${rev.toLocaleString('en-NP', { maximumFractionDigits: 0 })}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {revPct > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                            <div style={{ width: 60, height: 4, background: '#2a2f3d', borderRadius: 2 }}>
                              <div style={{ width: `${Math.min(revPct, 100)}%`, height: '100%', background: '#c9a84c', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 36 }}>{revPct.toFixed(1)}%</span>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '2px solid #2a2f3d' }}>
                  <td colSpan={2} style={{ fontWeight: 700, color: '#9ca3af', paddingTop: 12 }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{totalPeriodCovers.toLocaleString()}</td>
                  <td></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#c9a84c', fontSize: 15, paddingTop: 12 }}>
                    NPR {totalPeriodRevenue.toLocaleString('en-NP', { maximumFractionDigits: 0 })}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
