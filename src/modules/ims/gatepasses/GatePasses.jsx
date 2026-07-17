import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../supabaseClient'
import { useScopedDb } from '../../../shared/hooks/useScopedDb'
import Fab from '../../../components/Fab'
import Tip from '../../../components/Tip'
import { printWithTitle } from '../../../utils/printTitle'
import GatePassPrint from './GatePassPrint'
import NewGatePassModal from './NewGatePassModal'

const PURPOSE_LABELS = { delivery: 'Delivery', pickup: 'Pickup', maintenance: 'Maintenance', other: 'Other' }

// No role gate beyond the route's own <ModuleGate module="ims"> (App.js) — IMS has no
// staff/supervisor role concept the way POS does, so any Owner/Admin who can reach this page
// can issue a gate pass. See CLAUDE.md's Parking Slip feature notes.
export default function GatePasses() {
  const { clientId, profile } = useAuth()
  const { scopedFrom, scopedInsert, scopedUpdate } = useScopedDb()

  const [passes, setPasses]   = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('open') // 'open' | 'all'
  const [showNew, setShowNew] = useState(false)
  const [printPass, setPrintPass] = useState(null)
  const [bizInfo, setBizInfo] = useState({ name: '', address: '', vatNumber: '' })
  const [staffNames, setStaffNames] = useState({})

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    const [{ data: p }, { data: v }, { data: client }, { data: settings }, { data: profs }] = await Promise.all([
      scopedFrom('ims_gate_passes').order('created_at', { ascending: false }),
      scopedFrom('vendors').eq('is_active', true).order('name'),
      supabase.from('clients').select('name').eq('id', clientId).single(),
      supabase.from('settings').select('property_address, vat_number').eq('client_id', clientId).maybeSingle(),
      // Raw `profiles` reads are RLS-limited to the caller's own row — resolving OTHER staff
      // members' names needs get_client_profile_names(), a SECURITY DEFINER RPC.
      supabase.rpc('get_client_profile_names', { p_client_id: clientId }),
    ])
    setPasses(p || [])
    setVendors(v || [])
    setBizInfo({ name: client?.name || '', address: settings?.property_address || '', vatNumber: settings?.vat_number || '' })
    setStaffNames(Object.fromEntries((profs || []).map(pr => [pr.id, pr.full_name])))
    setLoading(false)
  }, [clientId, scopedFrom])

  useEffect(() => { load() }, [load])

  async function handleSaved(payload) {
    const { data: pass, error } = await scopedInsert('ims_gate_passes', { ...payload, issued_by: profile?.id || null }, { single: true })
    if (error) return { error }
    setShowNew(false)
    load()
    setPrintPass(pass)
    setTimeout(() => {
      printWithTitle(`Gate Pass - ${pass.vehicle_number} - G-${pass.pass_no}`)
      setPrintPass(null)
    }, 60)
    return {}
  }

  async function markExited(pass) {
    await scopedUpdate('ims_gate_passes', { status: 'closed', time_out: new Date().toISOString() }).eq('id', pass.id)
    load()
  }

  function reprint(pass) {
    setPrintPass(pass)
    setTimeout(() => {
      printWithTitle(`Gate Pass - ${pass.vehicle_number} - G-${pass.pass_no}`)
      setPrintPass(null)
    }, 60)
    scopedUpdate('ims_gate_passes', { print_count: (pass.print_count || 0) + 1 }).eq('id', pass.id)
    setPasses(prev => prev.map(x => x.id === pass.id ? { ...x, print_count: (x.print_count || 0) + 1 } : x))
  }

  const visible = filter === 'open' ? passes.filter(p => p.status === 'open') : passes

  return (
    <>
    <div className={printPass ? 'no-print' : ''}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Gate Passes</h1>
          <p className="page-subtitle">Issue a printable gate pass for a vendor or delivery vehicle</p>
        </div>
      </div>

      <div className="tab-bar" style={{ marginBottom: 20 }}>
        <button className={`tab-btn${filter === 'open' ? ' tab-btn--active' : ''}`} onClick={() => setFilter('open')}>Open</button>
        <button className={`tab-btn${filter === 'all' ? ' tab-btn--active' : ''}`} onClick={() => setFilter('all')}>All</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--theme-text2)', fontSize: 13 }}>Loading…</p>
      ) : visible.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--theme-text3)', fontSize: 13 }}>
          {filter === 'open' ? 'No vehicles currently on the premises.' : 'No gate passes issued yet.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Pass No</th>
                <th>Vendor / Company</th>
                <th>Driver</th>
                <th>Vehicle No</th>
                <th><Tip text="Reason for the visit — delivery, pickup, maintenance, or other." width={220}>Purpose</Tip></th>
                <th>Time In</th>
                <th><Tip text="Open means the vehicle is still on the premises; Closed means it's been marked as exited." width={260}>Status</Tip></th>
                <th>Issued By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: 'var(--theme-text1)' }}>G-{p.pass_no}</td>
                  <td>{p.vendor_name}</td>
                  <td>{p.driver_name}</td>
                  <td style={{ fontWeight: 600 }}>{p.vehicle_number}</td>
                  <td>{PURPOSE_LABELS[p.purpose] || p.purpose}</td>
                  <td>{new Date(p.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>
                    <span className={`badge ${p.status === 'open' ? 'badge-amber' : 'badge-green'}`}>
                      {p.status === 'open' ? 'Open' : 'Closed'}
                    </span>
                  </td>
                  <td>{staffNames[p.issued_by] || '—'}</td>
                  <td style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {p.status === 'open' && (
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => markExited(p)}>Mark Exited</button>
                    )}
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => reprint(p)}>Reprint</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewGatePassModal vendors={vendors} onClose={() => setShowNew(false)} onSaved={handleSaved} />
      )}

      <Fab onClick={() => setShowNew(true)} label="+ New Gate Pass" show={!showNew} />
    </div>

      {/* Print-only gate pass — see handleSaved()/reprint(); mounted only for the brief setTimeout
          window it takes to fire the browser print dialog, then unmounted. */}
      {printPass && (
        <div className="print-only">
          <GatePassPrint gatePass={printPass} bizInfo={bizInfo} issuedByName={staffNames[printPass.issued_by]} />
        </div>
      )}
    </>
  )
}
