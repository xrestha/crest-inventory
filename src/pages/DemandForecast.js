import { useState, useEffect, useCallback, Fragment } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import Tip from '../components/Tip'
import { BS_MONTHS, bsToAd } from '../utils/bsCalendar'
import { runForecast } from '../utils/demandForecastData'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fmtNpr = n => n == null ? '—' : `NPR ${Math.round(n).toLocaleString()}`

export default function DemandForecast() {
  const { clientId } = useAuth()
  const [horizon, setHorizon] = useState(7)
  const [forecast, setForecast] = useState([])
  const [recipeNames, setRecipeNames] = useState({})
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [msg, setMsg] = useState('')
  const [lastRun, setLastRun] = useState(null)

  const loadStored = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    const [{ data: rows }, { data: runs }] = await Promise.all([
      supabase.from('demand_forecast_daily')
        .select('*').eq('client_id', clientId).eq('horizon_days', horizon)
        .order('bs_year').order('bs_month').order('bs_day'),
      supabase.from('demand_forecast_run_log')
        .select('*').eq('client_id', clientId).order('run_at', { ascending: false }).limit(1),
    ])
    setLastRun(runs?.[0] || null)

    // Reshape stored rows (one covers-level row + N recipe-level rows per day) back into the
    // same per-day shape the recompute path already produces, so the table renders identically
    // whether its data came from a fresh run or a prior one.
    const byDay = {}
    for (const r of (rows || [])) {
      const key = `${r.bs_year}:${r.bs_month}:${r.bs_day}`
      const day = byDay[key] = byDay[key] || {
        bs: { year: r.bs_year, month: r.bs_month, day: r.bs_day },
        forecastCovers: null, forecastRevenue: null, forecastQtyByRecipe: {}, holiday: null,
      }
      if (r.recipe_id) day.forecastQtyByRecipe[r.recipe_id] = r.forecast_qty
      else { day.forecastCovers = r.forecast_covers; day.forecastRevenue = r.forecast_revenue }
    }
    const list = Object.values(byDay).sort((a, b) => a.bs.year - b.bs.year || a.bs.month - b.bs.month || a.bs.day - b.bs.day)
    setForecast(list)

    const recipeIds = [...new Set(list.flatMap(d => Object.keys(d.forecastQtyByRecipe)))]
    if (recipeIds.length > 0) {
      const { data: recs } = await supabase.from('recipes').select('id, name').in('id', recipeIds)
      setRecipeNames(Object.fromEntries((recs || []).map(r => [r.id, r.name])))
    }
    setLoading(false)
  }, [clientId, horizon])

  useEffect(() => { loadStored() }, [loadStored])

  async function handleRecompute() {
    setRecomputing(true); setMsg('')
    try {
      const { rowsWritten } = await runForecast(clientId, horizon)
      setMsg(`ok:Forecast recomputed — ${rowsWritten} rows written.`)
      await loadStored()
    } catch (err) {
      setMsg('error:' + (err.message || 'Recompute failed.'))
    }
    setRecomputing(false)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--theme-text1)', fontSize: 20 }}>
          Demand Forecast <Tip text="Predicts covers, revenue, and per-dish quantity for upcoming days using a day-of-week moving average over your last ~12 weeks of POS sales (or manual Sales entries if POS history is thin). A simple, auditable model — not a trained AI — so you can see exactly why a number was predicted." width={320}>ⓘ</Tip>
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--theme-text3)' }}>
          What to expect tomorrow, next week, and the rest of the month — for purchasing and prep planning.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 20 }}>
        <div className="tab-bar">
          <button className={`tab-btn${horizon === 7 ? ' tab-btn--active' : ''}`} onClick={() => setHorizon(7)}>Next 7 Days</button>
          <button className={`tab-btn${horizon === 30 ? ' tab-btn--active' : ''}`} onClick={() => setHorizon(30)}>Next 30 Days</button>
        </div>
        <Tip text="Rebuilds the forecast from your latest sales data. Run this whenever you want an up-to-date prediction — it does not run automatically.">
          <button className="btn btn-primary" onClick={handleRecompute} disabled={recomputing}>
            {recomputing ? 'Recomputing…' : '↻ Recompute Forecast'}
          </button>
        </Tip>
        {lastRun && (
          <span style={{ fontSize: 11, color: 'var(--theme-text3)' }}>
            Last run: {new Date(lastRun.run_at).toLocaleString()}
            {lastRun.error ? <span style={{ color: 'var(--theme-red)' }}> — failed: {lastRun.error}</span> : ` (${lastRun.rows_written} rows)`}
          </span>
        )}
      </div>

      {msg && <p style={{ color: msg.startsWith('error:') ? 'var(--theme-red)' : 'var(--theme-green)', fontSize: 13, marginBottom: 12 }}>{msg.replace(/^(error|ok):/, '')}</p>}

      {loading ? (
        <p style={{ color: 'var(--theme-text3)', fontSize: 13 }}>Loading…</p>
      ) : forecast.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--theme-text3)', fontSize: 13 }}>
          No forecast yet for this horizon — click "Recompute Forecast" to generate one.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date (BS)</th><th>Day</th>
                <th style={{ textAlign: 'right' }}>Forecast Covers</th>
                <th style={{ textAlign: 'right' }}>Forecast Revenue</th>
                <th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((f, idx) => {
                const weekday = bsToAd(f.bs.year, f.bs.month, f.bs.day).getDay()
                const expanded = expandedIdx === idx
                const topItems = Object.entries(f.forecastQtyByRecipe)
                  .sort((a, b) => b[1] - a[1]).slice(0, 5)
                return (
                  <Fragment key={idx}>
                    <tr onClick={() => setExpandedIdx(expanded ? null : idx)} style={{ cursor: topItems.length > 0 ? 'pointer' : 'default' }}>
                      <td style={{ fontWeight: 600, color: 'var(--theme-text1)' }}>{f.bs.day} {BS_MONTHS[f.bs.month - 1]} {f.bs.year}</td>
                      <td>{WEEKDAYS[weekday]}</td>
                      <td style={{ textAlign: 'right' }}>{f.forecastCovers != null ? Math.round(f.forecastCovers) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtNpr(f.forecastRevenue)}</td>
                      <td>{f.holiday && <Tip text={`Historical model does not auto-adjust for this holiday — treat the forecast as a floor, not a ceiling, on a festival day.`}><span className="badge-amber" style={{ fontSize: 10 }}>{f.holiday.name}</span></Tip>}</td>
                      <td style={{ textAlign: 'right', color: 'var(--theme-text3)', fontSize: 11 }}>{topItems.length > 0 ? (expanded ? '▲ hide items' : '▼ top items') : ''}</td>
                    </tr>
                    {expanded && topItems.length > 0 && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--theme-bg)', padding: '10px 16px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
                            {topItems.map(([recipeId, qty]) => (
                              <span key={recipeId}><strong style={{ color: 'var(--theme-text1)' }}>{recipeNames[recipeId] || recipeId}</strong>: {qty.toFixed(1)}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
