import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../supabaseClient'
import BsCalendarPicker from '../../../components/BsCalendarPicker'
import { getBsToday, BS_MONTHS } from '../../../utils/bsCalendar'
import { workingDaysInRange } from '../leave/leaveConstants'

const fmt = n => Math.round(n || 0).toLocaleString('en-NP')
const inp = {
  background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)', borderRadius: 6,
  padding: '7px 10px', fontSize: 13, color: 'var(--theme-text1)', outline: 'none', width: '100%', fontFamily: 'inherit',
}
const lbl = { fontSize: 11, color: 'var(--theme-text3)', marginBottom: 4, display: 'block' }
const STATUS_BADGE = { pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red', cancelled: 'badge-gray' }

// Employee-facing self-service home — own payslip / leave / roster only, via narrow RPCs scoped
// to the caller's own hr_employee_id (see migration 20260707260000). No ModuleGate/Layout chrome,
// same "standalone public-entry page" reasoning as PosLogin.jsx→/pos, just for a different kind
// of restricted account.
export default function SelfServiceHome() {
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const today = getBsToday()

  const [tab, setTab] = useState('payslip') // payslip | leave | roster
  const [payslips, setPayslips] = useState(null)
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leaveRequests, setLeaveRequests] = useState(null)
  const [rosterYear, setRosterYear] = useState(today.year)
  const [rosterMonth, setRosterMonth] = useState(today.month)
  const [roster, setRoster] = useState(null)

  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!authLoading && (!session || !profile?.hr_self_service)) {
      navigate('/login', { replace: true })
    }
  }, [authLoading, session, profile, navigate])

  const loadPayslips = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_hr_payslips')
    setPayslips(data || [])
  }, [])

  const loadLeave = useCallback(async () => {
    const [{ data: types }, { data: reqs }] = await Promise.all([
      supabase.rpc('get_my_leave_types'),
      supabase.rpc('get_my_leave_requests'),
    ])
    setLeaveTypes(types || [])
    setLeaveRequests(reqs || [])
    if (!leaveTypeId && types?.length > 0) setLeaveTypeId(types[0].id)
  }, [leaveTypeId])

  const loadRoster = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_roster', { p_bs_year: rosterYear, p_bs_month: rosterMonth })
    setRoster(data || [])
  }, [rosterYear, rosterMonth])

  useEffect(() => { if (profile?.hr_self_service && tab === 'payslip') loadPayslips() }, [profile, tab, loadPayslips])
  useEffect(() => { if (profile?.hr_self_service && tab === 'leave') loadLeave() }, [profile, tab, loadLeave])
  useEffect(() => { if (profile?.hr_self_service && tab === 'roster') loadRoster() }, [profile, tab, loadRoster])

  const days = startDate && endDate ? workingDaysInRange(startDate, endDate).length : 0

  async function submitLeave() {
    if (!leaveTypeId) { setMsg('error:Select a leave type.'); return }
    if (!startDate || !endDate) { setMsg('error:Select start and end dates.'); return }
    if (days === 0) { setMsg('error:No working days in that range.'); return }
    setSubmitting(true); setMsg('')
    const { error } = await supabase.rpc('submit_my_leave_request', {
      p_leave_type_id: leaveTypeId, p_start_date: startDate, p_end_date: endDate, p_days: days, p_reason: reason,
    })
    setSubmitting(false)
    if (error) { setMsg('error:' + error.message); return }
    setStartDate(''); setEndDate(''); setReason(''); setMsg('ok:Leave request submitted.')
    loadLeave()
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  if (authLoading || !profile?.hr_self_service) {
    return <div style={{ padding: 40, color: 'var(--theme-text3)', textAlign: 'center' }}>Loading…</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-bg)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 20px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--theme-text1)' }}>{profile.full_name}</h1>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--theme-text3)' }}>Employee Self-Service</p>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={signOut}>Sign Out</button>
        </div>

        <div className="tab-bar" style={{ marginBottom: 20 }}>
          <button className={`tab-btn${tab === 'payslip' ? ' tab-btn--active' : ''}`} onClick={() => setTab('payslip')}>Payslip</button>
          <button className={`tab-btn${tab === 'leave' ? ' tab-btn--active' : ''}`} onClick={() => setTab('leave')}>Leave</button>
          <button className={`tab-btn${tab === 'roster' ? ' tab-btn--active' : ''}`} onClick={() => setTab('roster')}>Roster</button>
        </div>

        {tab === 'payslip' && (
          payslips === null ? <p style={{ color: 'var(--theme-text3)' }}>Loading…</p>
          : payslips.length === 0 ? <p style={{ color: 'var(--theme-text3)' }}>No finalized payslips yet.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {payslips.map(p => (
                <div key={p.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: 'var(--theme-text1)' }}>{BS_MONTHS[p.bs_month - 1]} {p.bs_year}</span>
                    <span style={{ fontWeight: 700, color: 'var(--theme-green)' }}>NPR {fmt(p.net_pay)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12, color: 'var(--theme-text2)' }}>
                    <span>Basic</span><span style={{ textAlign: 'right' }}>{fmt(p.basic)}</span>
                    <span>Allowances</span><span style={{ textAlign: 'right' }}>{fmt(p.allowances)}</span>
                    <span>Gross</span><span style={{ textAlign: 'right' }}>{fmt(p.gross)}</span>
                    <span>SSF (Employee)</span><span style={{ textAlign: 'right' }}>−{fmt(p.ssf_employee)}</span>
                    {p.advance_deduction > 0 && (<><span>Advance</span><span style={{ textAlign: 'right' }}>−{fmt(p.advance_deduction)}</span></>)}
                    {p.tds > 0 && (<><span>TDS</span><span style={{ textAlign: 'right' }}>−{fmt(p.tds)}</span></>)}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'leave' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--theme-text1)' }}>Submit Leave Request</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={lbl}>Leave Type</label>
                  <select className="form-select" style={{ width: '100%' }} value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)}>
                    {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}{t.annual_quota > 0 ? ` (${t.annual_quota}/yr)` : ''}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Start (BS)</label>
                    <BsCalendarPicker value={startDate} onChange={setStartDate} placeholder="Select date" clearable />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>End (BS)</label>
                    <BsCalendarPicker value={endDate} onChange={setEndDate} placeholder="Select date" clearable />
                  </div>
                </div>
                {days > 0 && <div style={{ fontSize: 12, color: 'var(--theme-text3)' }}>{days} working day{days !== 1 ? 's' : ''} (Saturdays excluded)</div>}
                <div>
                  <label style={lbl}>Reason</label>
                  <textarea style={{ ...inp, height: 60, resize: 'vertical' }} value={reason} onChange={e => setReason(e.target.value)} />
                </div>
                {msg && <div style={{ fontSize: 12, color: msg.startsWith('ok') ? 'var(--theme-green)' : 'var(--theme-red)' }}>{msg.replace(/^(ok|error):/, '')}</div>}
                <button className="btn btn-primary" onClick={submitLeave} disabled={submitting} style={{ alignSelf: 'flex-end' }}>
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--theme-text1)' }}>My Requests</h3>
              {leaveRequests === null ? <p style={{ color: 'var(--theme-text3)' }}>Loading…</p>
                : leaveRequests.length === 0 ? <p style={{ color: 'var(--theme-text3)', fontSize: 13 }}>No requests yet.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {leaveRequests.map(r => (
                      <div key={r.id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--theme-text1)' }}>{r.start_date} → {r.end_date} ({r.days}d)</div>
                          {r.reason && <div style={{ fontSize: 11, color: 'var(--theme-text3)' }}>{r.reason}</div>}
                        </div>
                        <span className={STATUS_BADGE[r.status]} style={{ textTransform: 'capitalize', fontSize: 10 }}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}

        {tab === 'roster' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <select className="form-select" value={rosterMonth} onChange={e => setRosterMonth(parseInt(e.target.value, 10))}>
                {BS_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select className="form-select" value={rosterYear} onChange={e => setRosterYear(parseInt(e.target.value, 10))}>
                {Array.from({ length: 3 }, (_, i) => today.year - 1 + i).map(y => <option key={y} value={y}>BS {y}</option>)}
              </select>
            </div>
            {roster === null ? <p style={{ color: 'var(--theme-text3)' }}>Loading…</p>
              : roster.length === 0 ? <p style={{ color: 'var(--theme-text3)', fontSize: 13 }}>No shifts scheduled this month.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {roster.map((r, i) => (
                    <div key={i} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: 'var(--theme-text1)', fontWeight: 600 }}>Day {r.bs_day}</span>
                      <span style={{ fontSize: 13, color: 'var(--theme-text2)' }}>
                        {r.shift_type_name || '—'}{r.shift_start && ` (${r.shift_start}–${r.shift_end})`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  )
}
