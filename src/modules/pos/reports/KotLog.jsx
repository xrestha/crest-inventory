import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../supabaseClient'
import Tip from '../../../components/Tip'
import BsCalendarPicker from '../../../components/BsCalendarPicker'
import { formatAd, adToBs, BS_MONTHS } from '../../../utils/bsCalendar'

export default function KotLog() {
  const { clientId, hasPosAccess } = useAuth()

  const [tab, setTab] = useState('register') // 'register' | 'reconciliation'
  const [fromIso, setFromIso] = useState(formatAd(new Date()))
  const [toIso,   setToIso]   = useState(formatAd(new Date()))

  /* ── Register ── */
  const [logRows, setLogRows] = useState([])
  const [staffNames, setStaffNames] = useState({})
  const [registerLoading, setRegisterLoading] = useState(true)

  const loadRegister = useCallback(async () => {
    if (!clientId) return
    setRegisterLoading(true)
    const fromTs = new Date(fromIso + 'T00:00:00').toISOString()
    const toTs   = new Date(toIso + 'T23:59:59.999').toISOString()

    const [{ data: logs }, { data: profs }] = await Promise.all([
      supabase.from('pos_kot_log').select('*')
        .eq('client_id', clientId).gte('sent_at', fromTs).lte('sent_at', toTs)
        .order('sent_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('client_id', clientId),
    ])
    setStaffNames(Object.fromEntries((profs || []).map(p => [p.id, p.full_name])))
    setLogRows(logs || [])
    setRegisterLoading(false)
  }, [clientId, fromIso, toIso])

  useEffect(() => { if (tab === 'register') loadRegister() }, [tab, loadRegister])

  /* ── Reconciliation ── */
  const [discrepancies, setDiscrepancies] = useState([])
  const [reconLoading, setReconLoading] = useState(true)

  const loadReconciliation = useCallback(async () => {
    if (!clientId) return
    setReconLoading(true)
    const fromTs = new Date(fromIso + 'T00:00:00').toISOString()
    const toTs   = new Date(toIso + 'T23:59:59.999').toISOString()

    const { data: orders } = await supabase.from('pos_orders')
      .select('id, status, close_type, table_name, order_no, closed_at')
      .eq('client_id', clientId).in('status', ['billed', 'voided'])
      .gte('closed_at', fromTs).lte('closed_at', toTs)
    const orderList = orders || []
    if (orderList.length === 0) { setDiscrepancies([]); setReconLoading(false); return }
    const orderIds = orderList.map(o => o.id)
    const orderById = Object.fromEntries(orderList.map(o => [o.id, o]))

    const [{ data: logs }, { data: currentItems }] = await Promise.all([
      supabase.from('pos_kot_log').select('order_id, items').in('order_id', orderIds),
      supabase.from('pos_order_items').select('order_id, recipe_id, name, qty').in('order_id', orderIds),
    ])

    // Total ever sent, per (order_id, recipe_id) — summing every log row's printed qty gives the
    // true cumulative quantity sent to the kitchen for that item across the order's lifetime.
    const sentByOrderItem = {}
    for (const log of logs || []) {
      for (const i of (log.items || [])) {
        const key = `${log.order_id}::${i.recipe_id}`
        sentByOrderItem[key] = sentByOrderItem[key] || { orderId: log.order_id, recipeId: i.recipe_id, name: i.name, qty: 0 }
        sentByOrderItem[key].qty += i.qty
      }
    }
    const currentByOrderItem = {}
    for (const i of (currentItems || [])) {
      currentByOrderItem[`${i.order_id}::${i.recipe_id}`] = i.qty
    }

    const rows = []
    for (const entry of Object.values(sentByOrderItem)) {
      const order = orderById[entry.orderId]
      if (!order) continue
      const currentQty = currentByOrderItem[`${entry.orderId}::${entry.recipeId}`] || 0
      const discrepancy = entry.qty - currentQty
      const voided = order.status === 'voided'
      if (discrepancy > 0 || voided) {
        rows.push({
          key: `${entry.orderId}::${entry.recipeId}`,
          order, name: entry.name, sentQty: entry.qty, currentQty, discrepancy,
          reason: voided ? 'Order voided — food was sent' : 'Reduced/removed after sending',
        })
      }
    }
    setDiscrepancies(rows.sort((a, b) => new Date(b.order.closed_at) - new Date(a.order.closed_at)))
    setReconLoading(false)
  }, [clientId, fromIso, toIso])

  useEffect(() => { if (tab === 'reconciliation') loadReconciliation() }, [tab, loadReconciliation])

  if (!hasPosAccess('manager')) return <Navigate to="/pos" replace />

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    if (tab === 'register') {
      const ws = XLSX.utils.json_to_sheet(logRows.map(r => {
        const bs = adToBs(new Date(r.sent_at))
        return {
          'Date (BS)': `${bs.day} ${BS_MONTHS[bs.month - 1]} ${bs.year}`,
          'Time': new Date(r.sent_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          'Table': r.table_name || 'Takeaway',
          'Order#': r.order_no,
          'Station': r.station,
          'Items': (r.items || []).map(i => `${i.name} ×${i.qty}`).join(', '),
          'Sent By': staffNames[r.sent_by] || '—',
        }
      }))
      XLSX.utils.book_append_sheet(wb, ws, 'KOT Register')
      XLSX.writeFile(wb, `kot-register-${fromIso}-to-${toIso}.xlsx`)
    } else {
      const ws = XLSX.utils.json_to_sheet(discrepancies.map(d => ({
        'Order#': d.order.order_no, 'Table': d.order.table_name || 'Takeaway', 'Status': d.order.status,
        'Item': d.name, 'Sent Qty': d.sentQty, 'Current Qty': d.currentQty, 'Discrepancy': d.discrepancy, 'Reason': d.reason,
      })))
      XLSX.utils.book_append_sheet(wb, ws, 'KOT Reconciliation')
      XLSX.writeFile(wb, `kot-reconciliation-${fromIso}-to-${toIso}.xlsx`)
    }
  }

  const loading = tab === 'register' ? registerLoading : reconLoading
  const isEmpty = tab === 'register' ? logRows.length === 0 : discrepancies.length === 0

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1150 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--theme-text1)', fontSize: 20 }}>
          KOT Log <Tip text="Register is a queryable log of every kitchen/bar ticket ever sent. Reconciliation compares what was sent to the kitchen against what's currently on each order, flagging food that was cooked but then reduced, removed, or the order was voided entirely — the anti-fraud check." width={320}>ⓘ</Tip>
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--theme-text3)' }}>
          Every ticket sent to the kitchen, and whether it matches what was actually billed.
        </p>
      </div>

      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-btn${tab === 'register' ? ' tab-btn--active' : ''}`} onClick={() => setTab('register')}>Register</button>
        <button className={`tab-btn${tab === 'reconciliation' ? ' tab-btn--active' : ''}`} onClick={() => setTab('reconciliation')}>Reconciliation</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--theme-text3)', display: 'block', marginBottom: 4 }}>From (BS)</label>
          <BsCalendarPicker value={fromIso} onChange={setFromIso} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--theme-text3)', display: 'block', marginBottom: 4 }}>To (BS)</label>
          <BsCalendarPicker value={toIso} onChange={setToIso} />
        </div>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={exportExcel} disabled={isEmpty}>⬇ Excel</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--theme-text3)', fontSize: 13 }}>Loading…</p>
      ) : isEmpty ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--theme-text3)', fontSize: 13 }}>
          {tab === 'register' ? 'No KOT/BOT tickets sent in this range.' : 'No discrepancies — a quiet report is a healthy one. 🎉'}
        </div>
      ) : tab === 'register' ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Date/Time (BS)</th><th>Table</th><th>Order#</th><th>Station</th><th>Items</th><th>Sent By</th></tr>
            </thead>
            <tbody>
              {logRows.map(r => {
                const bs = adToBs(new Date(r.sent_at))
                return (
                  <tr key={r.id}>
                    <td>
                      {bs.day} {BS_MONTHS[bs.month - 1]}
                      <span style={{ color: 'var(--theme-text3)', fontSize: 11, marginLeft: 6 }}>
                        {new Date(r.sent_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td>{r.table_name || 'Takeaway'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--theme-text1)' }}>#{r.order_no}</td>
                    <td><span className={r.station === 'BOT' ? 'badge-gold' : 'badge-green'} style={{ fontSize: 11 }}>{r.station}</span></td>
                    <td>{(r.items || []).map(i => `${i.name} ×${i.qty}`).join(', ')}</td>
                    <td>{staffNames[r.sent_by] || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order#</th><th>Table</th><th>Status</th><th>Item</th>
                <th style={{ textAlign: 'right' }}>Sent Qty</th><th style={{ textAlign: 'right' }}>Current Qty</th>
                <th style={{ textAlign: 'right' }}>Discrepancy</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {discrepancies.map(d => (
                <tr key={d.key}>
                  <td style={{ fontWeight: 600, color: 'var(--theme-text1)' }}>#{d.order.order_no}</td>
                  <td>{d.order.table_name || 'Takeaway'}</td>
                  <td><span className={d.order.status === 'voided' ? 'badge-red' : 'badge-green'} style={{ fontSize: 11 }}>{d.order.status === 'voided' ? 'Voided' : 'Billed'}</span></td>
                  <td>{d.name}</td>
                  <td style={{ textAlign: 'right' }}>{d.sentQty}</td>
                  <td style={{ textAlign: 'right' }}>{d.currentQty}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{d.discrepancy}</td>
                  <td>{d.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
