import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../supabaseClient'
import Tip from '../../../components/Tip'
import { getBsToday, getBsFiscalYear } from '../../../utils/bsCalendar'
import { computeOrderAmounts } from '../../../utils/posBillingMath'

const fmtNpr = n => `NPR ${Math.round(n).toLocaleString()}`
const THRESHOLD = 100000
const WALKIN_KEY = '__CASH_SALES__'

export default function OneLakhAboveReport() {
  const { clientId, hasPosAccess } = useAuth()

  const today = getBsToday()
  const currentFy = getBsFiscalYear(today.year, today.month)

  const [fyOptions, setFyOptions] = useState([currentFy])
  const [selectedFy, setSelectedFy] = useState(currentFy)
  const [parties, setParties] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientId) return
    supabase.from('pos_orders').select('invoice_fy').eq('client_id', clientId).not('invoice_fy', 'is', null)
      .then(({ data }) => {
        const fys = [...new Set((data || []).map(r => r.invoice_fy))]
          .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
        if (fys.length > 0) {
          setFyOptions(fys.includes(currentFy) ? fys : [currentFy, ...fys])
          if (!fys.includes(selectedFy)) setSelectedFy(fys[0])
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    const [{ data: orders }, { data: settings }] = await Promise.all([
      supabase.from('pos_orders')
        .select('id, buyer_name, buyer_pan, discount_amount')
        .eq('client_id', clientId).eq('status', 'billed').eq('close_type', 'paid').eq('invoice_fy', selectedFy),
      supabase.from('settings').select('is_vat_registered').eq('client_id', clientId).maybeSingle(),
    ])
    const vatReg = settings?.is_vat_registered ?? true
    const orderList = orders || []

    let itemsByOrder = {}
    if (orderList.length > 0) {
      const { data: items } = await supabase.from('pos_order_items')
        .select('order_id, qty, unit_price, vat_rate').in('order_id', orderList.map(o => o.id))
      itemsByOrder = (items || []).reduce((acc, i) => {
        ;(acc[i.order_id] = acc[i.order_id] || []).push(i)
        return acc
      }, {})
    }

    const grouped = {}
    for (const o of orderList) {
      const amounts = computeOrderAmounts(o, itemsByOrder[o.id] || [], vatReg)
      const pan = (o.buyer_pan || '').trim()
      const name = (o.buyer_name || '').trim()
      const key = pan || name || WALKIN_KEY
      grouped[key] = grouped[key] || { name: name || 'CASH SALES / WALK-IN', pan, bills: 0, gross: 0, taxable: 0, nonTaxable: 0, vat: 0, net: 0 }
      grouped[key].bills += 1
      grouped[key].gross += amounts.grossAmt
      grouped[key].taxable += amounts.taxableBase
      grouped[key].nonTaxable += amounts.nonTaxableBase
      grouped[key].vat += amounts.vatAmt
      grouped[key].net += amounts.net
    }

    setParties(Object.entries(grouped).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.net - a.net))
    setLoading(false)
  }, [clientId, selectedFy])

  useEffect(() => { load() }, [load])

  if (!hasPosAccess('manager')) return <Navigate to="/pos" replace />

  const totals = parties.reduce((s, p) => ({ gross: s.gross + p.gross, vat: s.vat + p.vat, net: s.net + p.net }), { gross: 0, vat: 0, net: 0 })

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(parties.map(p => ({
      'Party Name': p.name,
      'PAN': p.pan || '',
      'Bill Count': p.bills,
      'Gross (NPR)': Math.round(p.gross * 100) / 100,
      'Taxable (NPR)': Math.round(p.taxable * 100) / 100,
      'Non-Taxable (NPR)': Math.round(p.nonTaxable * 100) / 100,
      'VAT (NPR)': Math.round(p.vat * 100) / 100,
      'Net (NPR)': Math.round(p.net * 100) / 100,
      'Annexure 13 (>1L)': p.net > THRESHOLD ? (p.pan ? 'Yes' : 'Yes — MISSING PAN') : '',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'One Lakh Above')
    XLSX.writeFile(wb, `one-lakh-above-${selectedFy.replace('/', '-')}.xlsx`)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--theme-text1)', fontSize: 20 }}>
          One Lakh Above Report <Tip text="Nepal VAT return Annexure 13 (अनुसूची १३): any single party (by name+PAN) whose cumulative transactions exceed NPR 1,00,000 in a fiscal year must be disclosed. This report aggregates POS sales by buyer across the selected fiscal year and flags who crosses that threshold." width={320}>ⓘ</Tip>
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--theme-text3)' }}>
          Party-wise POS sales for the fiscal year — flags parties above NPR 1,00,000 for Annexure 13 disclosure.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--theme-text3)', display: 'block', marginBottom: 4 }}>Fiscal Year (BS)</label>
          <select className="form-select" value={selectedFy} onChange={e => setSelectedFy(e.target.value)}>
            {fyOptions.map(fy => <option key={fy} value={fy}>{fy}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={exportExcel} disabled={parties.length === 0}>⬇ Excel</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--theme-text3)', fontSize: 13 }}>Loading…</p>
      ) : parties.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--theme-text3)', fontSize: 13 }}>
          No paid bills in FY {selectedFy}.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Party Name</th><th>PAN</th><th style={{ textAlign: 'right' }}>Bills</th>
                <th style={{ textAlign: 'right' }}>Gross</th><th style={{ textAlign: 'right' }}>Taxable</th>
                <th style={{ textAlign: 'right' }}>Non-Taxable</th><th style={{ textAlign: 'right' }}>VAT</th>
                <th style={{ textAlign: 'right' }}>Net</th>
                <th>
                  <Tip text="Rows above NPR 1,00,000 must be disclosed in Annexure 13 of the VAT return. A missing PAN on a flagged row means the party's name alone was recorded — ask for PAN on their next visit." width={280}>Flag</Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {parties.map(p => {
                const over = p.net > THRESHOLD
                return (
                  <tr key={p.key}>
                    <td style={{ fontWeight: 600, color: 'var(--theme-text1)' }}>{p.name}</td>
                    <td>{p.pan || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{p.bills}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNpr(p.gross)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNpr(p.taxable)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNpr(p.nonTaxable)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNpr(p.vat)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtNpr(p.net)}</td>
                    <td>
                      {over && !p.pan && <span className="badge-red" style={{ fontSize: 11 }}>⚠ Missing PAN</span>}
                      {over && p.pan && <span className="badge-amber" style={{ fontSize: 11 }}>Annexure 13</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={3}>TOTAL</td>
                <td style={{ textAlign: 'right' }}>{fmtNpr(totals.gross)}</td>
                <td></td><td></td>
                <td style={{ textAlign: 'right' }}>{fmtNpr(totals.vat)}</td>
                <td style={{ textAlign: 'right' }}>{fmtNpr(totals.net)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
