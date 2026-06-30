import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import Tip from '../../../components/Tip'
import { BS_MONTHS } from '../../../utils/bsCalendar'

const fmt  = n => Math.round(n || 0).toLocaleString('en-NP')
const fmtD = iso => iso ? new Date(iso).toLocaleDateString('en-NP', { day: 'numeric', month: 'short' }) : '—'

function nextMonthLabel(bs_year, bs_month) {
  if (!bs_year || !bs_month) return '—'
  const nm = bs_month === 12 ? 1   : bs_month + 1
  const ny = bs_month === 12 ? bs_year + 1 : bs_year
  return `${BS_MONTHS[nm - 1]} 15, ${ny}`
}

// Clickable KPI card
function KCard({ label, value, sub, color = 'var(--theme-text1)', tip, onClick, alert }) {
  return (
    <div
      className="stat-card"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="stat-label">
        {tip ? <Tip text={tip} width={260}>{label}</Tip> : label}
      </div>
      <div className="stat-value" style={{ color, fontSize: typeof value === 'string' && value.length > 8 ? 16 : undefined }}>
        {value}
      </div>
      {sub && <div className="stat-sub" style={alert ? { color: '#f87171' } : undefined}>{sub}</div>}
    </div>
  )
}

export default function HrDashboard() {
  const { clientId } = useAuth()
  const navigate     = useNavigate()
  const [loading, setLoading] = useState(true)

  const [empStats,    setEmpStats]    = useState(null)
  const [leaveList,   setLeaveList]   = useState([])
  const [otList,      setOtList]      = useState([])
  const [payInfo,     setPayInfo]     = useState(null)
  const [advOutstanding, setAdvOutstanding] = useState(0)
  const [empMap,      setEmpMap]      = useState({})
  const [typeMap,     setTypeMap]     = useState({})

  useEffect(() => {
    if (!clientId) return
    load()
  }, [clientId]) // eslint-disable-line

  async function load() {
    setLoading(true)

    const [
      { data: emps },
      { data: ltypes },
      { data: leaves },
      { data: otPending },
      { data: runs },
      { data: advs },
      { data: reps },
    ] = await Promise.all([
      supabase.from('hr_employees')
        .select('id, full_name, status, retirement_date, basic_salary')
        .eq('client_id', clientId),
      supabase.from('hr_leave_types')
        .select('id, name').eq('client_id', clientId),
      supabase.from('hr_leave_requests')
        .select('id, employee_id, leave_type_id, status, start_date, end_date, created_at')
        .eq('client_id', clientId).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(8),
      supabase.from('hr_overtime_entries')
        .select('id, employee_id, bs_year, bs_month, bs_day, ot_hours, ot_type, created_at')
        .eq('client_id', clientId).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(8),
      supabase.from('hr_payroll_runs')
        .select('id, monthly_periods(bs_year, bs_month)')
        .eq('client_id', clientId).eq('status', 'finalized')
        .order('created_at', { ascending: false }).limit(1),
      supabase.from('hr_advances')
        .select('id, amount').eq('client_id', clientId).eq('status', 'active'),
      supabase.from('hr_advance_repayments')
        .select('advance_id, amount').eq('client_id', clientId),
    ])

    // ── Employee stats ─────────────────────────────────────────────────────────
    const todayMs = new Date().setHours(0, 0, 0, 0)
    const RETIRE_DAYS = 180
    let payrollBase = 0, retiringSoon = 0
    ;(emps || []).forEach(e => {
      if (e.status === 'active' || e.status === 'probation') payrollBase += parseFloat(e.basic_salary || 0)
      if (e.retirement_date && (e.status === 'active' || e.status === 'probation')) {
        const days = Math.round((new Date(e.retirement_date) - todayMs) / 86400000)
        if (days >= 0 && days <= RETIRE_DAYS) retiringSoon++
      }
    })
    setEmpStats({
      total:      (emps || []).length,
      active:     (emps || []).filter(e => e.status === 'active').length,
      probation:  (emps || []).filter(e => e.status === 'probation').length,
      payrollBase,
      retiringSoon,
    })

    // ── Lookup maps ────────────────────────────────────────────────────────────
    const eMap = Object.fromEntries((emps || []).map(e => [e.id, e.full_name]))
    const tMap = Object.fromEntries((ltypes || []).map(t => [t.id, t.name]))
    setEmpMap(eMap)
    setTypeMap(tMap)

    // ── Leave + OT queues ──────────────────────────────────────────────────────
    setLeaveList(leaves || [])
    setOtList(otPending || [])

    // ── Advances outstanding ───────────────────────────────────────────────────
    const repMap = {}
    ;(reps || []).forEach(r => { repMap[r.advance_id] = (repMap[r.advance_id] || 0) + parseFloat(r.amount || 0) })
    const outstanding = (advs || []).reduce((s, a) => s + Math.max(0, parseFloat(a.amount || 0) - (repMap[a.id] || 0)), 0)
    setAdvOutstanding(outstanding)

    // ── Last finalized payroll ─────────────────────────────────────────────────
    const lastRun = runs?.[0]
    if (lastRun) {
      const { data: slips } = await supabase
        .from('hr_payslips')
        .select('net_pay, ssf_employee, ssf_employer')
        .eq('run_id', lastRun.id)
      const mp = lastRun.monthly_periods
      setPayInfo({
        periodLabel:  mp ? `${BS_MONTHS[mp.bs_month - 1]} ${mp.bs_year}` : '—',
        netPay:       (slips || []).reduce((s, x) => s + (x.net_pay       || 0), 0),
        ssfEmployee:  (slips || []).reduce((s, x) => s + (x.ssf_employee  || 0), 0),
        ssfEmployer:  (slips || []).reduce((s, x) => s + (x.ssf_employer  || 0), 0),
        bsYear:       mp?.bs_year,
        bsMonth:      mp?.bs_month,
        count:        (slips || []).length,
      })
    }

    setLoading(false)
  }

  if (loading) return <div className="page-container"><div className="loading-state">Loading HR Dashboard…</div></div>

  const pendingLeave = leaveList.length
  const pendingOt    = otList.length

  return (
    <div className="page-container">
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title">HR Dashboard</h1>
        <p className="page-subtitle">Headcount · Payroll · Leave & OT queues · SSF · Advances at a glance</p>
      </div>

      {/* ── KPI Row 1 — Headcount ───────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: 'var(--theme-text3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Headcount</div>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <KCard
          label="Active Staff"
          value={empStats?.active ?? '—'}
          sub={empStats?.probation > 0 ? `+ ${empStats.probation} on probation` : 'no probation'}
          color="var(--theme-green)"
          tip="Active employees only. Probation shown separately — both are included in payroll."
          onClick={() => navigate('/hr/employees')}
        />
        <KCard
          label="Basic Payroll / Month"
          value={`NPR ${fmt(empStats?.payrollBase)}`}
          sub="active + probation, basic only"
          color="var(--theme-accent)"
          tip="Sum of basic salary for active and probation employees. Full payroll (allowances, SSF, TDS) is computed during the payroll run."
          onClick={() => navigate('/hr/payroll')}
        />
        <KCard
          label="Leave Pending"
          value={pendingLeave}
          sub={pendingLeave > 0 ? 'awaiting approval' : 'all clear'}
          color={pendingLeave > 0 ? '#c9a84c' : 'var(--theme-green)'}
          tip="Leave requests with status Pending — click to go to the Leave page and approve or reject."
          onClick={() => navigate('/hr/leave')}
          alert={pendingLeave > 0}
        />
        <KCard
          label="OT Pending"
          value={pendingOt}
          sub={pendingOt > 0 ? 'awaiting approval' : 'all clear'}
          color={pendingOt > 0 ? '#c9a84c' : 'var(--theme-green)'}
          tip="Overtime entries not yet approved. Only approved OT feeds into payroll — approve before running payroll."
          onClick={() => navigate('/hr/overtime')}
          alert={pendingOt > 0}
        />
        <KCard
          label="Advances Outstanding"
          value={`NPR ${fmt(advOutstanding)}`}
          sub="active advance & loan balances"
          tip="Total remaining balance across all active (unsettled) advances and loans."
          onClick={() => navigate('/hr/advances')}
        />
        <KCard
          label="Retiring Soon"
          value={empStats?.retiringSoon ?? 0}
          sub="within 180 days"
          color={empStats?.retiringSoon > 0 ? '#c9a84c' : 'var(--theme-green)'}
          tip="Active or probation employees whose retirement date (DOB + 60 years) falls within the next 180 days."
          onClick={() => navigate('/hr/employees')}
          alert={empStats?.retiringSoon > 0}
        />
      </div>

      {/* ── Payroll + SSF ───────────────────────────────────────────────────── */}
      {payInfo && (
        <>
          <div style={{ fontSize: 11, color: 'var(--theme-text3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Last Finalized Payroll — {payInfo.periodLabel} ({payInfo.count} employees)
          </div>
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            <KCard
              label="Net Payable"
              value={`NPR ${fmt(payInfo.netPay)}`}
              sub={`${payInfo.periodLabel} take-home total`}
              color="var(--theme-green)"
              tip="Total net pay disbursed to all employees in the last finalized payroll run."
              onClick={() => navigate('/hr/payroll')}
            />
            <KCard
              label="SSF — Employee (11%)"
              value={`NPR ${fmt(payInfo.ssfEmployee)}`}
              sub="deducted from payslips"
              tip="Total employee SSF contributions (11% of capped basic) deducted across all enrolled employees."
            />
            <KCard
              label="SSF — Employer (20%)"
              value={`NPR ${fmt(payInfo.ssfEmployer)}`}
              sub="company contribution"
              tip="Total employer SSF contribution (20% of capped basic) — paid by the company on top of net pay."
            />
            <KCard
              label="SSF Total to Deposit"
              value={`NPR ${fmt(payInfo.ssfEmployee + payInfo.ssfEmployer)}`}
              sub={`Deposit by ${nextMonthLabel(payInfo.bsYear, payInfo.bsMonth)}`}
              color="#c9a84c"
              tip={`SSF challan (employee 11% + employer 20%) for ${payInfo.periodLabel}. Deposit with SSF by the 15th of the following month. Go to HR Reports → SSF Challan for the per-employee breakdown.`}
              onClick={() => navigate('/hr/reports')}
              alert
            />
          </div>
        </>
      )}

      {!payInfo && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 20, fontSize: 13, color: 'var(--theme-text2)' }}>
          No finalized payroll yet. Generate and finalize a payroll run to see net pay and SSF summary here.
        </div>
      )}

      {/* ── Pending queues ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>

        {/* Leave queue */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--theme-text3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Pending Leave Requests {pendingLeave > 0 && <span style={{ color: '#c9a84c' }}>({pendingLeave})</span>}
          </div>
          <div className="card" style={{ padding: 0 }}>
            {leaveList.length === 0 ? (
              <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--theme-text3)' }}>No pending leave requests ✓</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveList.map(r => (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/hr/leave')}>
                      <td style={{ fontWeight: 600, fontSize: 12, color: 'var(--theme-text1)' }}>{empMap[r.employee_id] || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--theme-text2)' }}>{typeMap[r.leave_type_id] || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--theme-text3)' }}>{fmtD(r.start_date)}</td>
                      <td style={{ fontSize: 12, color: 'var(--theme-text3)' }}>{fmtD(r.end_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {pendingLeave > 0 && (
            <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 8 }} onClick={() => navigate('/hr/leave')}>
              Go to Leave → approve / reject
            </button>
          )}
        </div>

        {/* OT queue */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--theme-text3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Pending OT Entries {pendingOt > 0 && <span style={{ color: '#c9a84c' }}>({pendingOt})</span>}
          </div>
          <div className="card" style={{ padding: 0 }}>
            {otList.length === 0 ? (
              <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--theme-text3)' }}>No pending OT entries ✓</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th style={{ textAlign: 'center' }}>Date</th>
                    <th style={{ textAlign: 'center' }}>Hours</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {otList.map(e => (
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/hr/overtime')}>
                      <td style={{ fontWeight: 600, fontSize: 12, color: 'var(--theme-text1)' }}>{empMap[e.employee_id] || '—'}</td>
                      <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--theme-text3)' }}>
                        {BS_MONTHS[e.bs_month - 1]} {e.bs_day}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#34d399', fontSize: 12 }}>{e.ot_hours}h</td>
                      <td>
                        <span className={e.ot_type === 'holiday' ? 'badge-amber' : 'badge-gray'} style={{ fontSize: 10 }}>
                          {e.ot_type === 'holiday' ? 'Holiday 2×' : 'Weekday 1.5×'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {pendingOt > 0 && (
            <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 8 }} onClick={() => navigate('/hr/overtime')}>
              Go to Overtime → approve / reject
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
