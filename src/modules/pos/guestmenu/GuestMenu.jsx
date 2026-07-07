import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../supabaseClient'
import { NUTRIENTS } from '../../../utils/nutrition'
import Modal from '../../../components/Modal'

const fmtNpr = n => `NPR ${Math.round(n).toLocaleString()}`
const fmtNutrient = (def, value) => `${(Number(value) || 0).toFixed(def.dp)} ${def.unit}`
const priceIncVat = item => Math.round((parseFloat(item.selling_price) || 0) * (1 + (parseFloat(item.vat_rate) || 0)))

// Same three stages + wording as the staff-side floor-view badge (PosOrders.jsx) and KDS board —
// worded from the guest's point of view: their order was Sent to the kitchen, is being Prepared,
// or is Ready to be served.
const KOT_STATUS_BADGE = { new: 'badge-red', in_progress: 'badge-amber', ready: 'badge-green' }
const KOT_STATUS_LABEL = { new: 'Order sent to kitchen', in_progress: 'Being prepared', ready: 'Ready to serve' }

// Status of the guest's own submitted request, distinct from KOT_STATUS above — this tracks
// whether staff has even Accepted the request yet (see submit_guest_order/pos_guest_order_requests),
// which happens before a KOT is ever sent. Once staff actually sends the KOT, KOT_STATUS_BADGE
// above takes over as the more specific signal, so this banner hides itself once kotStatus exists.
const REQUEST_BADGE = { pending: 'badge-amber', accepted: 'badge-green', dismissed: 'badge-red' }
const REQUEST_LABEL = {
  pending: 'Order sent to staff — waiting for confirmation…',
  accepted: 'Order confirmed by staff',
  dismissed: "Staff couldn't take this order — please ask for assistance",
}

const sessionKey = tableId => `guestOrderReq:${tableId}`

// Fully public, unauthenticated page — reached by a guest scanning a table's QR code (see
// PosTableManagement.jsx's "Print QR" action). Shows the live POS menu for that table's client;
// if the client has guest_ordering enabled (Pro-tier feature flag, see migration
// 20260707210000_guest_ordering.sql) guests can also add items to a cart and submit an order.
// A submitted order lands as a 'pending' pos_guest_order_requests row, NOT directly in
// pos_order_items — a staff member must review and Accept it in PosOrders.jsx before it becomes
// part of the real order. All data comes from get_guest_menu, which does its own authorization
// (table → client → pos_enabled check) since there's no logged-in session here to gate on.
export default function GuestMenu() {
  const { tableId } = useParams()
  const [rows, setRows] = useState(null) // null = loading, [] = loaded-but-empty
  const [error, setError] = useState(false)
  const [kotStatus, setKotStatus] = useState(null) // null = no open order / nothing sent yet

  const [cart, setCart] = useState({}) // recipe_id -> qty
  const [reviewOpen, setReviewOpen] = useState(false)
  const [guestNote, setGuestNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [requestId, setRequestId] = useState(() => sessionStorage.getItem(sessionKey(tableId)) || null)
  const [requestStatus, setRequestStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_guest_menu', { p_table_id: tableId }).then(({ data, error: err }) => {
      if (cancelled) return
      if (err) { setError(true); setRows([]); return }
      setRows(data || [])
    })
    return () => { cancelled = true }
  }, [tableId])

  // 5s poll while the guest has the menu open — same cadence as the staff floor-view badge.
  useEffect(() => {
    let cancelled = false
    const poll = () => supabase.rpc('get_guest_table_status', { p_table_id: tableId }).then(({ data }) => {
      if (cancelled) return
      const row = data?.[0]
      setKotStatus(row?.has_open_order ? row.kot_status : null)
    })
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [tableId])

  // Poll the guest's own submitted request, if any, for staff Accept/Dismiss.
  useEffect(() => {
    if (!requestId) return
    let cancelled = false
    const poll = () => supabase.rpc('get_guest_order_request_status', { p_request_id: requestId }).then(({ data }) => {
      if (cancelled) return
      const row = data?.[0]
      if (row) setRequestStatus(row.status)
    })
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [requestId])

  if (rows === null) {
    return <CenteredMessage>Loading menu…</CenteredMessage>
  }
  if (error || rows.length === 0) {
    return <CenteredMessage>
      Menu not available. Please ask staff for assistance.
    </CenteredMessage>
  }

  const outletName = rows[0].outlet_name
  const tableName = rows[0].table_name
  const nutritionEnabled = rows[0].nutrition_enabled
  const orderingEnabled = rows[0].guest_ordering_enabled

  const byRecipe = Object.fromEntries(rows.map(r => [r.recipe_id, r]))
  const categories = []
  const byCategory = {}
  for (const r of rows) {
    const cat = r.category || 'Other'
    if (!byCategory[cat]) { byCategory[cat] = []; categories.push(cat) }
    byCategory[cat].push(r)
  }

  const cartLines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([recipeId, qty]) => ({ item: byRecipe[recipeId], qty }))
    .filter(l => l.item)
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0)
  const cartTotal = cartLines.reduce((s, l) => s + priceIncVat(l.item) * l.qty, 0)

  function setQty(recipeId, qty) {
    setCart(prev => ({ ...prev, [recipeId]: Math.max(0, Math.min(50, qty)) }))
  }

  async function placeOrder() {
    setSubmitting(true)
    setSubmitError('')
    const payload = cartLines.map(l => ({ recipe_id: l.item.recipe_id, qty: l.qty }))
    const { data, error: err } = await supabase.rpc('submit_guest_order', {
      p_table_id: tableId, p_items: payload, p_notes: guestNote || null,
    })
    setSubmitting(false)
    if (err) {
      setSubmitError(err.message || 'Could not place order — please ask staff for assistance.')
      return
    }
    sessionStorage.setItem(sessionKey(tableId), data)
    setRequestId(data)
    setRequestStatus('pending')
    setCart({})
    setGuestNote('')
    setReviewOpen(false)
  }

  function orderAgain() {
    sessionStorage.removeItem(sessionKey(tableId))
    setRequestId(null)
    setRequestStatus(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-bg)', color: 'var(--theme-text1)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 20px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>{outletName}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-text3)' }}>{tableName}</p>
          {kotStatus ? (
            <span className={KOT_STATUS_BADGE[kotStatus]} style={{ display: 'inline-block', marginTop: 10, fontSize: 11 }}>
              {KOT_STATUS_LABEL[kotStatus]}
            </span>
          ) : requestStatus && (
            <div style={{ marginTop: 10 }}>
              <span className={REQUEST_BADGE[requestStatus]} style={{ display: 'inline-block', fontSize: 11 }}>
                {REQUEST_LABEL[requestStatus]}
              </span>
              {requestStatus === 'dismissed' && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={orderAgain}>Order again</button>
                </div>
              )}
            </div>
          )}
        </div>

        {categories.map(cat => (
          <div key={cat} style={{ marginBottom: 28 }}>
            <h2 style={{
              fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--theme-accent)', margin: '0 0 12px', paddingBottom: 6,
              borderBottom: '1px solid var(--theme-border)',
            }}>{cat}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {byCategory[cat].map(item => (
                <MenuItemCard
                  key={item.recipe_id} item={item} nutritionEnabled={nutritionEnabled}
                  orderingEnabled={orderingEnabled}
                  qty={cart[item.recipe_id] || 0}
                  onQtyChange={qty => setQty(item.recipe_id, qty)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {orderingEnabled && cartCount > 0 && (
        <button
          onClick={() => setReviewOpen(true)}
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 50,
            maxWidth: 608, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'var(--theme-accent)', color: '#fff', fontSize: 14, fontWeight: 700,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          <span>{cartCount} item{cartCount > 1 ? 's' : ''} · {fmtNpr(cartTotal)}</span>
          <span>View Order →</span>
        </button>
      )}

      {reviewOpen && (
        <Modal title="Your Order" onClose={() => setReviewOpen(false)} maxWidth={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cartLines.length === 0 && <p style={{ fontSize: 13, color: 'var(--theme-text2)' }}>Your cart is empty.</p>}
            {cartLines.map(l => (
              <div key={l.item.recipe_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 14 }}>{l.item.name}</span>
                <Stepper qty={l.qty} onChange={qty => setQty(l.item.recipe_id, qty)} />
                <span style={{ width: 74, textAlign: 'right', fontSize: 13, color: 'var(--theme-text2)' }}>
                  {fmtNpr(priceIncVat(l.item) * l.qty)}
                </span>
              </div>
            ))}
            {cartLines.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--theme-border)' }}>
                  <span>Total</span>
                  <span>{fmtNpr(cartTotal)}</span>
                </div>
                <textarea
                  value={guestNote} onChange={e => setGuestNote(e.target.value)}
                  placeholder="Any notes for the kitchen? (optional)"
                  rows={2}
                  style={{
                    marginTop: 8, width: '100%', resize: 'vertical', borderRadius: 6,
                    border: '1px solid var(--theme-border)', background: 'var(--theme-input-bg)',
                    color: 'var(--theme-text1)', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box',
                  }}
                />
                {submitError && <p style={{ color: 'var(--theme-red)', fontSize: 12.5, margin: 0 }}>{submitError}</p>}
                <button
                  className="btn btn-primary" disabled={submitting} onClick={placeOrder}
                  style={{ marginTop: 4 }}
                >
                  {submitting ? 'Placing order…' : 'Place Order'}
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function Stepper({ qty, onChange }) {
  const btn = {
    width: 26, height: 26, borderRadius: 4, border: '1px solid var(--theme-border)',
    background: 'var(--theme-input-bg)', color: 'var(--theme-text1)', cursor: 'pointer',
    fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" style={btn} onClick={() => onChange(qty - 1)}>−</button>
      <span style={{ minWidth: 18, textAlign: 'center', fontSize: 13 }}>{qty}</span>
      <button type="button" style={btn} onClick={() => onChange(qty + 1)}>+</button>
    </div>
  )
}

function MenuItemCard({ item, nutritionEnabled, orderingEnabled, qty, onQtyChange }) {
  const [imgFailed, setImgFailed] = useState(false)
  const priceInc = priceIncVat(item)

  return (
    <div className="card" style={{ display: 'flex', gap: 14, padding: 14 }}>
      {item.image_url && !imgFailed && (
        <img
          src={item.image_url} alt={item.name} onError={() => setImgFailed(true)}
          style={{ width: 84, height: 84, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--theme-input-bg)' }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {item.is_veg != null && (
              <span title={item.is_veg ? 'Veg' : 'Non-Veg'} style={{
                display: 'inline-block', width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                border: `1.5px solid ${item.is_veg ? 'var(--theme-green)' : 'var(--theme-red)'}`,
              }}>
                <span style={{
                  display: 'block', width: 6, height: 6, margin: '2px auto', borderRadius: '50%',
                  background: item.is_veg ? 'var(--theme-green)' : 'var(--theme-red)',
                }} />
              </span>
            )}
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--theme-text1)' }}>{item.name}</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--theme-accent)', whiteSpace: 'nowrap' }}>{fmtNpr(priceInc)}</span>
        </div>
        {item.description && (
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--theme-text2)', lineHeight: 1.4 }}>{item.description}</p>
        )}
        {nutritionEnabled && item.has_nutrition && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {NUTRIENTS.map(def => (
              <span key={def.key} style={{ fontSize: 10.5, color: 'var(--theme-text3)' }}>
                {def.label} {fmtNutrient(def, item[def.key])}
              </span>
            ))}
          </div>
        )}
        {nutritionEnabled && item.has_nutrition && item.allergens?.length > 0 && (
          <p style={{ margin: '4px 0 0', fontSize: 10.5, color: 'var(--theme-amber)', textTransform: 'capitalize' }}>
            Allergens: {item.allergens.join(', ')}
          </p>
        )}
        {orderingEnabled && (
          <div style={{ marginTop: 10 }}>
            {qty > 0 ? (
              <Stepper qty={qty} onChange={onQtyChange} />
            ) : (
              <button
                type="button" className="btn btn-ghost" style={{ fontSize: 12.5, padding: '4px 12px' }}
                onClick={() => onQtyChange(1)}
              >+ Add</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CenteredMessage({ children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--theme-bg)', color: 'var(--theme-text2)', fontSize: 14, padding: 24, textAlign: 'center',
    }}>
      {children}
    </div>
  )
}
