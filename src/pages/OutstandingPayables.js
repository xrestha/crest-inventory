import { Fragment, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { bsToAd } from '../utils/bsCalendar'
import Tip from '../components/Tip'

const BS_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra']
const TODAY = new Date().toISOString().split('T')[0]

const INPUT = {
  background: 'var(--theme-input-bg, #161b27)',
  border: '1px solid var(--theme-border, #2a2f3d)',
  borderRadius: 6, padding: '7px 10px', fontSize: 13,
  color: 'var(--theme-text, #e8e0d0)', outline: 'none',
}

function aging(days) {
  if (days <= 30) return { label: 'Current',    color: '#34d399' }
  if (days <= 60) return { label: '31–60 days', color: '#c9a84c' }
  if (days <= 90) return { label: '61–90 days', color: '#f97316' }
  return                 { label: '90+ days',   color: '#f87171' }
}

export default function OutstandingPayables() {
  const { clientId, profile, loading: authLoading } = useAuth()
  const effectiveClientId = clientId || profile?.client_id

  const [entries, setEntries]           = useState([])
  const [paymentsMap, setPaymentsMap]   = useState({})
  const [loading, setLoading]           = useState(true)
  const [setupNeeded, setSetupNeeded]   = useState(false)
  const [filterVendor, setFilterVendor] = useState('all')
  const [filterAging, setFilterAging]   = useState('all')
  const [activeTab, setActiveTab]       = useState('outstanding')
  const [expandedEntry, setExpandedEntry] = useState(null)
  const [payForm, setPayForm]           = useState({ amount: '', paid_at: TODAY, note: '' })
  const [savingPayment, setSavingPayment] = useState(false)

  useEffect(() => { if (!authLoading && effectiveClientId) load(activeTab) }, [clientId]) // eslint-disable-line

  async function load(tab = activeTab) {
    setLoading(true)
    setFilterVendor('all')
    setFilterAging('all')
    setExpandedEntry(null)

    let query = supabase
      .from('purchase_entries')
      .select('id, bs_day, qty, rate, invoice_ref, paid_at, monthly_periods!inner(client_id, bs_year, bs_month), items(name, uom, categories(name)), vendors(name)')
      .eq('monthly_periods.client_id', effectiveClientId)
      .eq('payment_method', 'Credit')

    if (tab === 'outstanding') {
      query = query.is('paid_at', null).order('created_at', { ascending: true })
    } else {
      query = query.not('paid_at', 'is', null).order('paid_at', { ascending: false })
    }

    const { data, error } = await query

    if (error) {
      if (error.code === '42703' || error.message?.includes('paid_at')) setSetupNeeded(true)
      setLoading(false)
      return
    }

    const today = new Date()
    const ids = (data || []).map(e => e.id)

    let pmtMap = {}
    if (ids.length > 0) {
      const { data: pmts } = await supabase
        .from('payable_payments')
        .select('*')
        .in('purchase_entry_id', ids)
        .order('paid_at', { ascending: true })
      ;(pmts || []).forEach(p => {
        if (!pmtMap[p.purchase_entry_id]) pmtMap[p.purchase_entry_id] = []
        pmtMap[p.purchase_entry_id].push(p)
      })
    }
    setPaymentsMap(pmtMap)

    const enriched = (data || []).map(e => {
      const pr = e.monthly_periods
      const adDate = bsToAd(pr.bs_year, pr.bs_month, e.bs_day || 1)
      const daysOld = Math.max(0, Math.floor((today - adDate) / (1000 * 60 * 60 * 24)))
      const value = parseFloat(e.qty) * parseFloat(e.rate)
      const paidTotal = (pmtMap[e.id] || []).reduce((s, p) => s + parseFloat(p.amount), 0)
      const remaining = Math.max(0, value - paidTotal)
      return { ...e, period: pr, value, paidTotal, remaining, daysOld, aging: aging(daysOld) }
    })
    setEntries(enriched)
    setLoading(false)
  }

  function switchTab(tab) { setActiveTab(tab); load(tab) }

  function toggleExpand(id) {
    setExpandedEntry(prev => prev === id ? null : id)
    setPayForm({ amount: '', paid_at: TODAY, note: '' })
  }

  async function addPayment(entry) {
    const amount = parseFloat(payForm.amount)
    if (!amount || amount <= 0) return
    setSavingPayment(true)

    await supabase.from('payable_payments').insert({
      purchase_entry_id: entry.id,
      amount,
      paid_at: payForm.paid_at || TODAY,
      note: payForm.note || null,
    })

    // Fully settled — stamp paid_at on the entry
    if (entry.paidTotal + amount >= entry.value) {
      await supabase.from('purchase_entries')
        .update({ paid_at: payForm.paid_at || TODAY })
        .eq('id', entry.id)
    }

    setSavingPayment(false)
    load(activeTab)
  }

  const vendors = [...new Map(entries.map(e => [e.vendors?.name, e.vendors])).values()].filter(Boolean)
  const AGING_LABELS = ['Current', '31–60 days', '61–90 days', '90+ days']

  const filtered = entries.filter(e => {
    const matchV = filterVendor === 'all' || e.vendors?.name === filterVendor
    const matchA = filterAging  === 'all' || e.aging.label    === filterAging
    return matchV && matchA
  })

  const byVendor = {}
  filtered.forEach(e => {
    const vName = e.vendors?.name || 'Unknown'
    if (!byVendor[vName]) byVendor[vName] = []
    byVendor[vName].push(e)
  })

  const totalRemaining = filtered.reduce((s, e) => s + (activeTab === 'outstanding' ? e.remaining : e.value), 0)
  const overdueItems   = filtered.filter(e => e.daysOld > 60).length
  const urgentValue    = filtered.filter(e => e.daysOld > 90).reduce((s, e) => s + e.remaining, 0)

  function fmt(v) { return `NPR ${Number(v).toLocaleString('en-NP', { maximumFractionDigits: 0 })}` }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Outstanding Payables</h1>
          <p className="page-subtitle">
            {activeTab === 'outstanding' ? 'Unpaid credit purchases — aging & partial payments' : 'Settled credit purchases — payment history'}
          </p>
        </div>
      </div>

      <div className="tab-bar" style={{ marginBottom: 24 }}>
        <button className={`tab-btn${activeTab === 'outstanding' ? ' tab-btn--active' : ''}`} onClick={() => switchTab('outstanding')}>Outstanding</button>
        <button className={`tab-btn${activeTab === 'paid'        ? ' tab-btn--active' : ''}`} onClick={() => switchTab('paid')}>Paid History</button>
      </div>

      {setupNeeded && (
        <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '16px 20px', marginBottom: 24, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: '#f87171', marginBottom: 8 }}>⚠ One-time setup required</div>
          <div style={{ color: '#9ca3af', marginBottom: 10 }}>Run this SQL in Supabase → SQL Editor, then refresh:</div>
          <code style={{ display: 'block', background: '#0f1117', padding: '10px 14px', borderRadius: 6, color: '#c9a84c', fontSize: 12, userSelect: 'all' }}>
            ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS paid_at date;
          </code>
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 24 }}>
        {activeTab === 'outstanding' ? (<>
          <div className="stat-card">
            <div className="stat-label"><Tip text="Total remaining balance across all outstanding credit purchases." width={220}>Total Remaining</Tip></div>
            <div className="stat-value" style={{ fontSize: 18, color: totalRemaining > 0 ? '#f87171' : '#6b7280' }}>{fmt(totalRemaining)}</div>
            <div className="stat-sub">{filtered.length} invoices · {Object.keys(byVendor).length} vendors</div>
          </div>
          <div className="stat-card">
            <div className="stat-label"><Tip text="Invoices with remaining balance older than 60 days." width={230}>Overdue Items</Tip></div>
            <div className="stat-value" style={{ color: overdueItems > 0 ? '#f97316' : '#6b7280' }}>{overdueItems}</div>
            <div className="stat-sub">&gt;60 days outstanding</div>
          </div>
          <div className="stat-card">
            <div className="stat-label"><Tip text="Remaining value on invoices over 90 days old. Urgent settlement needed." width={240}>90+ Day Value</Tip></div>
            <div className="stat-value" style={{ fontSize: 16, color: urgentValue > 0 ? '#f87171' : '#6b7280' }}>{urgentValue > 0 ? fmt(urgentValue) : '—'}</div>
            <div className="stat-sub">Urgent settlement</div>
          </div>
        </>) : (<>
          <div className="stat-card">
            <div className="stat-label"><Tip text="Total value of all fully settled credit purchases." width={220}>Total Paid</Tip></div>
            <div className="stat-value" style={{ fontSize: 18, color: '#34d399' }}>{fmt(totalRemaining)}</div>
            <div className="stat-sub">{filtered.length} settled invoices</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Vendors Paid</div>
            <div className="stat-value">{Object.keys(byVendor).length}</div>
            <div className="stat-sub">Unique vendors settled</div>
          </div>
          <div className="stat-card">
            <div className="stat-label"><Tip text="Most recently settled invoice date." width={200}>Last Settlement</Tip></div>
            <div className="stat-value" style={{ fontSize: 14 }}>{filtered.length > 0 ? filtered[0].paid_at : '—'}</div>
            <div className="stat-sub">{filtered.length > 0 ? filtered[0].vendors?.name : ''}</div>
          </div>
        </>)}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-select" value={filterVendor} onChange={e => setFilterVendor(e.target.value)}>
          <option value="all">All Vendors</option>
          {vendors.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
        </select>
        {activeTab === 'outstanding' && (
          <select className="form-select" value={filterAging} onChange={e => setFilterAging(e.target.value)}>
            <option value="all">All Ages</option>
            {AGING_LABELS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => load(activeTab)}>↻ Refresh</button>
      </div>

      {loading ? (
        <div className="card"><p style={{ color: '#6b7280', fontSize: 13 }}>Loading payables…</p></div>
      ) : setupNeeded ? null : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">✓</div>
            <p className="empty-state-text">
              {entries.length === 0
                ? 'No outstanding credit payables.'
                : 'No items match the current filters.'}
            </p>
          </div>
        </div>
      ) : (
        Object.entries(byVendor)
          .sort(([, a], [, b]) =>
            b.reduce((s, e) => s + e.remaining, 0) - a.reduce((s, e) => s + e.remaining, 0))
          .map(([vName, vRows]) => {
            const vendorTotal = vRows.reduce((s, e) => s + (activeTab === 'outstanding' ? e.remaining : e.value), 0)
            return (
              <div key={vName} className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #2a2f3d' }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#e8e0d0' }}>{vName}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: activeTab === 'outstanding' ? '#f87171' : '#34d399' }}>{fmt(vendorTotal)}</span>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Period</th>
                        <th>Invoice</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Rate</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        {activeTab === 'outstanding' ? (<>
                          <th style={{ textAlign: 'right' }}>Paid</th>
                          <th style={{ textAlign: 'right' }}>Remaining</th>
                          <th style={{ textAlign: 'right' }}><Tip text="Calendar days since this purchase." width={180}>Days</Tip></th>
                          <th>Status</th>
                          <th></th>
                        </>) : (<>
                          <th style={{ textAlign: 'right' }}>Total Paid</th>
                          <th>Settled On</th>
                          <th></th>
                        </>)}
                      </tr>
                    </thead>
                    <tbody>
                      {(activeTab === 'outstanding'
                        ? vRows.sort((a, b) => b.daysOld - a.daysOld)
                        : vRows
                      ).map(e => {
                        const payments = paymentsMap[e.id] || []
                        const isExpanded = expandedEntry === e.id
                        const isPartial = e.paidTotal > 0 && e.remaining > 0
                        const willSettle = payForm.amount && parseFloat(payForm.amount) + e.paidTotal >= e.value

                        return (
                          <Fragment key={e.id}>
                            <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpand(e.id)}>
                              <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{e.items?.name}</td>
                              <td><span className="badge badge-yellow">{e.items?.categories?.name || '—'}</span></td>
                              <td style={{ color: '#6b7280' }}>{BS_MONTHS[(e.period.bs_month || 1) - 1]} {e.period.bs_year}</td>
                              <td style={{ color: '#9ca3af', fontSize: 12 }}>{e.invoice_ref || '—'}</td>
                              <td style={{ textAlign: 'right', color: '#6b7280' }}>{parseFloat(e.qty).toLocaleString()} {e.items?.uom}</td>
                              <td style={{ textAlign: 'right', color: '#6b7280' }}>NPR {parseFloat(e.rate).toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#c9a84c' }}>{fmt(e.value)}</td>
                              {activeTab === 'outstanding' ? (<>
                                <td style={{ textAlign: 'right', color: e.paidTotal > 0 ? '#34d399' : '#6b7280' }}>
                                  {e.paidTotal > 0 ? fmt(e.paidTotal) : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#f87171' }}>{fmt(e.remaining)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: e.aging.color }}>{e.daysOld}</td>
                                <td>
                                  {isPartial
                                    ? <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>Partial</span>
                                    : <span style={{ fontSize: 11, fontWeight: 700, color: e.aging.color, background: `${e.aging.color}18`, border: `1px solid ${e.aging.color}40`, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>{e.aging.label}</span>
                                  }
                                </td>
                                <td style={{ color: '#c9a84c', fontSize: 12, whiteSpace: 'nowrap' }}>
                                  {isExpanded ? '▲ Close' : '＋ Pay'}
                                </td>
                              </>) : (<>
                                <td style={{ textAlign: 'right', color: '#34d399', fontWeight: 600 }}>
                                  {fmt(payments.length > 0 ? e.paidTotal : e.value)}
                                </td>
                                <td style={{ color: '#34d399', fontWeight: 600, fontSize: 13 }}>{e.paid_at}</td>
                                <td style={{ color: '#9ca3af', fontSize: 12, whiteSpace: 'nowrap' }}>
                                  {payments.length > 0 ? (isExpanded ? '▲ Hide' : `▼ ${payments.length} payment${payments.length > 1 ? 's' : ''}`) : ''}
                                </td>
                              </>)}
                            </tr>

                            {isExpanded && (
                              <tr>
                                <td colSpan={activeTab === 'outstanding' ? 12 : 10} style={{ padding: 0, background: 'rgba(10,12,18,0.7)' }}>
                                  <div style={{ padding: '16px 20px' }}>

                                    {/* Payment history */}
                                    {payments.length > 0 && (
                                      <div style={{ marginBottom: activeTab === 'outstanding' ? 20 : 0 }}>
                                        <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Payment History</div>
                                        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 400 }}>
                                          <thead>
                                            <tr>
                                              <th style={{ textAlign: 'left', padding: '4px 16px 4px 0', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>Date</th>
                                              <th style={{ textAlign: 'right', padding: '4px 16px', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>Amount</th>
                                              <th style={{ textAlign: 'left', padding: '4px 0 4px 16px', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>Note</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {payments.map(p => (
                                              <tr key={p.id}>
                                                <td style={{ padding: '5px 16px 5px 0', color: '#34d399' }}>{p.paid_at}</td>
                                                <td style={{ padding: '5px 16px', textAlign: 'right', color: '#e8e0d0', fontWeight: 600 }}>{fmt(p.amount)}</td>
                                                <td style={{ padding: '5px 0 5px 16px', color: '#9ca3af' }}>{p.note || '—'}</td>
                                              </tr>
                                            ))}
                                            {payments.length > 1 && (
                                              <tr style={{ borderTop: '1px solid #2a2f3d' }}>
                                                <td style={{ padding: '5px 16px 5px 0', color: '#6b7280', fontSize: 11 }}>Total paid</td>
                                                <td style={{ padding: '5px 16px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>{fmt(e.paidTotal)}</td>
                                                <td />
                                              </tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}

                                    {/* Add payment — outstanding only */}
                                    {activeTab === 'outstanding' && (
                                      <div>
                                        <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                                          {payments.length === 0 ? 'Record Payment' : 'Add Payment'}
                                        </div>
                                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                          <div>
                                            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Amount (NPR)</div>
                                            <input
                                              type="number"
                                              style={{ ...INPUT, width: 150 }}
                                              placeholder={`max ${fmt(e.remaining)}`}
                                              value={payForm.amount}
                                              onChange={ev => setPayForm(f => ({ ...f, amount: ev.target.value }))}
                                              onClick={ev => ev.stopPropagation()}
                                            />
                                          </div>
                                          <div>
                                            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Date</div>
                                            <input
                                              type="date"
                                              style={INPUT}
                                              value={payForm.paid_at}
                                              onChange={ev => setPayForm(f => ({ ...f, paid_at: ev.target.value }))}
                                              onClick={ev => ev.stopPropagation()}
                                            />
                                          </div>
                                          <div style={{ flex: 1, minWidth: 180 }}>
                                            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Note (optional)</div>
                                            <input
                                              type="text"
                                              style={{ ...INPUT, width: '100%' }}
                                              placeholder="e.g. Cheque #1234"
                                              value={payForm.note}
                                              onChange={ev => setPayForm(f => ({ ...f, note: ev.target.value }))}
                                              onClick={ev => ev.stopPropagation()}
                                            />
                                          </div>
                                          <button
                                            className="btn btn-primary"
                                            style={{ padding: '8px 18px', fontSize: 13 }}
                                            disabled={!payForm.amount || parseFloat(payForm.amount) <= 0 || savingPayment}
                                            onClick={ev => { ev.stopPropagation(); addPayment(e) }}
                                          >
                                            {savingPayment ? '…' : 'Save'}
                                          </button>
                                        </div>
                                        {willSettle && (
                                          <div style={{ marginTop: 8, fontSize: 12, color: '#34d399' }}>✓ This will fully settle the invoice</div>
                                        )}
                                      </div>
                                    )}

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
              </div>
            )
          })
      )}
    </div>
  )
}
