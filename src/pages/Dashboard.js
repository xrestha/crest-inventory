import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

const BS_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra']

export default function Dashboard() {
  const { profile, clientId, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [activePeriod, setActivePeriod] = useState(null)
  const [loading, setLoading] = useState(true)
  const [topVariance, setTopVariance] = useState([])

  useEffect(() => { if (clientId) loadStats() }, [clientId])

  async function loadStats() {
    setLoading(true)

    const { data: period } = await supabase
      .from('monthly_periods').select('*')
      .eq('client_id', clientId).eq('status', 'open')
      .order('bs_year', { ascending: false }).order('bs_month', { ascending: false })
      .limit(1).single()

    setActivePeriod(period)

    const [
      { count: itemCount },
      { count: vendorCount },
      { count: recipeCount },
      { data: purchases },
      { data: salesData },
      { data: recipes },
      { data: recipeIngs },
      { data: opening },
      { data: closing },
      { data: items }
    ] = await Promise.all([
      supabase.from('items').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_active', true),
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_active', true),
      supabase.from('recipes').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_active', true),
      period ? supabase.from('purchase_entries').select('qty, rate').eq('period_id', period.id) : { data: [] },
      period ? supabase.from('sales_entries').select('recipe_id, qty_sold').eq('period_id', period.id) : { data: [] },
      supabase.from('recipes').select('id, name, selling_price').eq('client_id', clientId),
      supabase.from('recipe_ingredients').select('recipe_id, item_id, qty_per_portion'),
      period ? supabase.from('opening_stock').select('item_id, qty').eq('period_id', period.id) : { data: [] },
      period ? supabase.from('closing_stock').select('item_id, physical_qty').eq('period_id', period.id) : { data: [] },
      supabase.from('items').select('id, name, uom, per_uom_rate, categories(name)').eq('client_id', clientId).eq('is_active', true)
    ])

    const purchaseTotal = (purchases || []).reduce((s, p) => s + p.qty * p.rate, 0)

    // Revenue from sales
    const soldMap = {}
    ;(salesData || []).forEach(s => { soldMap[s.recipe_id] = (soldMap[s.recipe_id] || 0) + parseFloat(s.qty_sold) })
    const revenueTotal = (recipes || []).reduce((s, r) => s + (soldMap[r.id] || 0) * (parseFloat(r.selling_price) || 0), 0)

    // Theoretical usage
    const theoreticalMap = {}
    ;(recipeIngs || []).forEach(ri => {
      const sold = soldMap[ri.recipe_id] || 0
      if (sold > 0) theoreticalMap[ri.item_id] = (theoreticalMap[ri.item_id] || 0) + sold * parseFloat(ri.qty_per_portion)
    })

    // Purchase map
    const purchMap = {}
    ;(purchases || []).forEach(p => { purchMap[p.item_id] = (purchMap[p.item_id] || 0) + parseFloat(p.qty || 0) })

    // Opening/closing maps
    const openMap = {}; (opening || []).forEach(r => { openMap[r.item_id] = parseFloat(r.qty) })
    const closeMap = {}; (closing || []).forEach(r => { closeMap[r.item_id] = parseFloat(r.physical_qty) })

    // Top variance items
    const varRows = (items || []).map(item => {
      const actual = (openMap[item.id] || 0) + (purchMap[item.id] || 0) - (closeMap[item.id] || 0)
      const theoretical = theoreticalMap[item.id] || 0
      const variance = actual - theoretical
      const value = variance * parseFloat(item.per_uom_rate || 0)
      return { name: item.name, variance, value, uom: item.uom, category: item.categories?.name }
    }).filter(r => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)

    setTopVariance(varRows)
    setStats({ itemCount, vendorCount, recipeCount, purchaseTotal, revenueTotal })
    setLoading(false)
  }

  const periodLabel = activePeriod ? `${BS_MONTHS[activePeriod.bs_month - 1]} ${activePeriod.bs_year}` : '—'
  const fcPct = stats?.revenueTotal > 0 ? (stats.purchaseTotal / stats.revenueTotal) * 100 : null

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {isAdmin ? 'Consultant view' : profile?.clients?.name || ''}
          {activePeriod && ` · ${periodLabel} · Open`}
        </p>
      </div>

      {!activePeriod && !loading && (
        <div className="card" style={{ marginBottom: 24, cursor: 'pointer', borderColor: 'rgba(201,168,76,0.3)' }} onClick={() => navigate('/periods')}>
          <p style={{ color: '#c9a84c', margin: 0, fontSize: 14 }}>
            ⚠ No open period. Click here to create one in Periods →
          </p>
        </div>
      )}

      {/* Main stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/purchases')}>
          <div className="stat-label">Purchases This Period</div>
          <div className="stat-value gold" style={{ fontSize: 20 }}>
            {loading ? '—' : `NPR ${(stats?.purchaseTotal || 0).toLocaleString('en-NP', { maximumFractionDigits: 0 })}`}
          </div>
          <div className="stat-sub">Total purchase value →</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/sales')}>
          <div className="stat-label">Revenue This Period</div>
          <div className="stat-value" style={{ fontSize: 20, color: '#34d399' }}>
            {loading ? '—' : `NPR ${(stats?.revenueTotal || 0).toLocaleString('en-NP', { maximumFractionDigits: 0 })}`}
          </div>
          <div className="stat-sub">From sales entries →</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/variance')}>
          <div className="stat-label">Purchase-Based Food Cost</div>
          <div className="stat-value" style={{
            fontSize: 20,
            color: fcPct == null ? '#6b7280' : fcPct <= 35 ? '#34d399' : fcPct <= 45 ? '#c9a84c' : '#f87171'
          }}>
            {loading ? '—' : fcPct != null ? `${fcPct.toFixed(1)}%` : '—'}
          </div>
          <div className="stat-sub">Benchmark: 28–35% →</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Period</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{loading ? '—' : periodLabel}</div>
          <div className="stat-sub" style={{ color: activePeriod ? '#34d399' : '#f87171' }}>
            {activePeriod ? 'Open' : 'No open period'}
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 24 }}>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/items')}>
          <div className="stat-label">Items in Master</div>
          <div className="stat-value">{loading ? '—' : stats?.itemCount}</div>
          <div className="stat-sub">Active ingredients →</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/vendors')}>
          <div className="stat-label">Vendors</div>
          <div className="stat-value">{loading ? '—' : stats?.vendorCount}</div>
          <div className="stat-sub">Active suppliers →</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/recipes')}>
          <div className="stat-label">Costed Recipes</div>
          <div className="stat-value">{loading ? '—' : stats?.recipeCount}</div>
          <div className="stat-sub">Active menu items →</div>
        </div>
      </div>

      {/* Top variance items */}
      {topVariance.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: '#e8e0d0' }}>Top Variance Items</h3>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => navigate('/variance')}>
              Full Report →
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Over-used</th>
                <th style={{ textAlign: 'right' }}>Value at Risk</th>
              </tr>
            </thead>
            <tbody>
              {topVariance.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{row.name}</td>
                  <td><span className="badge badge-yellow">{row.category || '—'}</span></td>
                  <td style={{ textAlign: 'right', color: '#f87171' }}>+{Number(row.variance.toFixed(2)).toLocaleString()} {row.uom}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#f87171' }}>
                    NPR {Number(row.value.toFixed(0)).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {topVariance.length === 0 && !loading && activePeriod && (
        <div className="card">
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
            Complete <strong style={{ color: '#c9a84c' }}>Stock Count</strong> and add <strong style={{ color: '#c9a84c' }}>Sales Entries</strong> to see variance analysis here.
          </p>
        </div>
      )}
    </div>
  )
}
