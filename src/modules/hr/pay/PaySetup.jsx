import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import Tip from '../../../components/Tip'
import { SSF_CAP, SSF_EMPLOYEE_PCT, PAY_BASES } from '../payrollConstants'
import PayForm from './PayForm'

const STATUS_COLORS = {
  active:     { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)'  },
  probation:  { color: '#c9a84c', bg: 'rgba(201,168,76,0.1)', border: 'rgba(201,168,76,0.2)'  },
  inactive:   { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' },
  resigned:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
  terminated: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
}

const fmt = n => Math.round(n || 0).toLocaleString('en-NP')
const payUnitOf = emp => (PAY_BASES.find(p => p.key === (emp.pay_basis || 'monthly')) || PAY_BASES[0]).unit

function calcAmount(comp, basic) {
  const v = parseFloat(comp.value) || 0
  if (comp.calc_type === 'percent_of_basic') return Math.round((parseFloat(basic) || 0) * v / 100)
  return Math.round(v)
}

export default function PaySetup() {
  const { clientId, profile } = useAuth()
  const effectiveClientId = clientId || profile?.client_id
  const [employees, setEmployees]   = useState([])
  const [components, setComponents] = useState([])
  const [loading, setLoading]       = useState(true)
  const [statusFilter, setStatusFilter] = useState('active')
  const [editing, setEditing]       = useState(null)

  const load = useCallback(async () => {
    if (!effectiveClientId) return
    setLoading(true)
    const [{ data: emps }, { data: comps }] = await Promise.all([
      supabase.from('hr_employees').select('*').eq('client_id', effectiveClientId).order('full_name'),
      supabase.from('hr_salary_components').select('*').eq('client_id', effectiveClientId),
    ])
    setEmployees(emps || [])
    setComponents(comps || [])
    setLoading(false)
  }, [effectiveClientId])

  useEffect(() => { load() }, [load])

  const filtered = employees.filter(e => statusFilter === 'all' || e.status === statusFilter)

  // Per-employee net (monthly only) — daily/hourly resolve at payroll.
  function netOf(emp) {
    if ((emp.pay_basis || 'monthly') !== 'monthly') return null
    const basic = parseFloat(emp.basic_salary) || 0
    const comps = components.filter(c => c.employee_id === emp.id)
    const allow = comps.filter(c => c.type === 'earning').reduce((s, c) => s + calcAmount(c, basic), 0)
    const otherDed = comps.filter(c => c.type === 'deduction').reduce((s, c) => s + calcAmount(c, basic), 0)
    const ssfEmp = Math.round(Math.min(basic, SSF_CAP) * SSF_EMPLOYEE_PCT)
    return basic + allow - ssfEmp - otherDed
  }

  const tabs = [
    { key: 'active',   label: 'Active' },
    { key: 'all',      label: 'All' },
    { key: 'inactive', label: 'Inactive' },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pay Setup</h1>
          <p className="page-subtitle">Set each employee's salary, allowances, deductions, SSF and bank details. Click an employee to edit.</p>
        </div>
      </div>

      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key} className={`tab-btn${statusFilter === t.key ? ' tab-btn--active' : ''}`} onClick={() => setStatusFilter(t.key)}>
            {t.label}
            <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>
              {employees.filter(e => t.key === 'all' || e.status === t.key).length}
            </span>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
            No employees found. Add employees first in HR → Employees.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Pay Basis</th>
                  <th style={{ textAlign: 'right' }}>
                    <Tip text="Monthly basic salary (or rate per day/hour for non-monthly staff)." width={240}>Basic / Rate</Tip>
                  </th>
                  <th style={{ textAlign: 'right', color: '#c9a84c' }}>
                    <Tip text="Take-home pay = basic + allowances − SSF (11%) − other deductions. Monthly staff only." width={250}>Net Salary</Tip>
                  </th>
                  <th>
                    <Tip text="Whether bank name + account number are on file for salary disbursement." width={240}>Bank</Tip>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => {
                  const st = STATUS_COLORS[emp.status] || STATUS_COLORS.inactive
                  const monthly = (emp.pay_basis || 'monthly') === 'monthly'
                  const net = netOf(emp)
                  const hasBank = emp.bank_name && emp.bank_account_no
                  return (
                    <tr key={emp.id} style={{ cursor: 'pointer' }} onClick={() => setEditing(emp)}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#e8e0d0', fontSize: 13 }}>{emp.full_name}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                          {emp.employee_code && <span style={{ fontSize: 10, color: '#6b7280' }}>{emp.employee_code}</span>}
                          <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, border: `1px solid ${st.border}`, borderRadius: 8, padding: '1px 6px' }}>{emp.status}</span>
                        </div>
                      </td>
                      <td style={{ color: '#6b7280', fontSize: 12 }}>{emp.department || '—'}</td>
                      <td style={{ color: '#9ca3af', fontSize: 12 }}>{monthly ? 'Monthly' : `Per ${payUnitOf(emp)}`}</td>
                      <td style={{ textAlign: 'right', color: '#9ca3af', fontSize: 13 }}>
                        {fmt(parseFloat(emp.basic_salary) || 0)}{!monthly && <span style={{ color: '#6b7280', fontSize: 11 }}> /{payUnitOf(emp)}</span>}
                      </td>
                      <td style={{ textAlign: 'right', color: '#c9a84c', fontSize: 14, fontWeight: 700 }}>
                        {monthly ? fmt(net) : <span style={{ color: '#6b7280', fontSize: 11, fontStyle: 'italic' }}>via payroll</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {hasBank
                          ? <span style={{ color: '#9ca3af' }}>{emp.bank_name}</span>
                          : <span style={{ color: '#c9a84c' }}>⚠ not set</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={ev => { ev.stopPropagation(); setEditing(emp) }}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <PayForm
          employee={editing}
          onSave={() => { setEditing(null); load() }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
