import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { evaluate } from '../utils/evalMath'

// Quick Calculator — a small always-available scratchpad for the arithmetic that comes up
// mid-task (unit conversions, pack maths, a quick margin check) without leaving the page you're
// on and losing an in-progress form.
//
// Shares evalMath's parser with QtyInput, so what evaluates in a stock-count box evaluates
// identically here. Portalled to document.body for the same reason CommandPalette is: it must
// escape any overflow:hidden / stacking context of whatever page is mounted underneath.

const KEYS = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '(', ')'],
]

export default function Calculator({ open, onClose }) {
  const [expr, setExpr] = useState('')
  // Tape entries are newest-first: the one you just did is the one you're most likely to reuse.
  const [tape, setTape] = useState([])
  const [copied, setCopied] = useState(null)
  const inputRef = useRef(null)

  const live = evaluate(expr)

  useEffect(() => {
    // Keep the tape across open/close within a session — reopening to re-check a figure you
    // worked out a minute ago is the common case. Only the expression box resets.
    if (open) {
      setExpr('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Document-level, not just the input's onKeyDown: this can now be nested inside a Modal (see
  // PurchaseBillModal), which has its own document keydown listener that closes IT on Escape.
  // Both listeners sit directly on `document`, so stopPropagation() is a no-op between them —
  // propagation only matters between ancestor/descendant elements, and there's only one target
  // here. stopImmediatePropagation() is what actually stops Modal's listener from also firing.
  // React runs child effects before parent effects, so this one is registered first and fires
  // first on Escape — without this, Escape would close the calculator AND silently discard
  // whatever form the parent Modal was holding.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  function commit() {
    const result = evaluate(expr)
    if (result === null) return
    setTape(t => [{ expr: expr.trim(), result, id: Date.now() }, ...t].slice(0, 50))
    // Chain from the result, the way a real calculator does — you usually keep going.
    setExpr(String(result))
    inputRef.current?.focus()
  }

  function press(k) {
    setExpr(e => e + k)
    inputRef.current?.focus()
  }

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(value)
      setTimeout(() => setCopied(null), 1200)
    } catch (_) {
      // Clipboard permission denied / insecure context — the number is on screen to read.
    }
  }

  // Escape is handled by the document-level listener above (needs stopImmediatePropagation to
  // beat a parent Modal's own Escape handler); this only needs Enter.
  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
  }

  if (!open) return null

  const tapeSum = tape.reduce((s, t) => s + t.result, 0)

  const keyBtn = {
    padding: '10px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    background: 'var(--theme-bg)', border: '1px solid var(--theme-border)',
    borderRadius: 6, color: 'var(--theme-text1)', fontFamily: 'inherit',
  }
  const opBtn = { ...keyBtn, color: 'var(--theme-accent)' }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 16px 40px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 340, background: 'var(--theme-card)',
          border: '1px solid var(--theme-border)', borderRadius: 10,
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--theme-border)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text1)', flex: 1 }}>Quick Calculator</span>
          <span style={{ fontSize: 'var(--font-size-micro)', color: 'var(--theme-text3)', border: '1px solid var(--theme-border)', borderRadius: 4, padding: '1px 5px' }}>Esc</span>
        </div>

        {/* Expression + live result */}
        <div style={{ padding: '12px 14px 10px' }}>
          <input
            ref={inputRef}
            value={expr}
            onChange={e => setExpr(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="3*24+7"
            inputMode="decimal"
            autoComplete="off"
            style={{
              width: '100%', background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)',
              borderRadius: 6, padding: '9px 11px', fontSize: 16, color: 'var(--theme-text1)',
              outline: 'none', textAlign: 'right', fontFamily: 'inherit',
            }}
          />
          <div
            onClick={() => live !== null && copy(live)}
            title={live !== null ? 'Click to copy' : undefined}
            style={{
              marginTop: 8, textAlign: 'right', fontSize: 22, fontWeight: 700, minHeight: 30,
              color: live === null ? 'var(--theme-text3)' : 'var(--theme-accent)',
              cursor: live !== null ? 'pointer' : 'default',
            }}
          >
            {live === null ? (expr.trim() ? '—' : '') : (copied === live ? '✓ copied' : live.toLocaleString())}
          </div>
        </div>

        {/* Keypad */}
        <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {KEYS.map((row, ri) => (
            row.map(k => (
              <button key={k} onClick={() => press(k)} style={'0123456789.'.includes(k) ? keyBtn : opBtn}>
                {k === '*' ? '×' : k === '/' ? '÷' : k}
              </button>
            )).concat(
              ri === 0 ? [<button key="clr" onClick={() => setExpr('')} style={{ ...keyBtn, color: 'var(--theme-red)', fontSize: 13 }}>C</button>]
              : ri === 1 ? [<button key="del" onClick={() => setExpr(e => e.slice(0, -1))} style={{ ...keyBtn, fontSize: 13 }}>⌫</button>]
              : ri === 2 ? [<button key="plus" onClick={() => press('+')} style={opBtn}>+</button>]
              : [<button key="eq" onClick={commit} disabled={live === null} style={{ ...keyBtn, background: 'var(--theme-accent)', borderColor: 'var(--theme-accent)', color: 'var(--theme-accent-text)', opacity: live === null ? 0.4 : 1 }}>=</button>]
            )
          ))}
        </div>

        {/* Tape */}
        {tape.length > 0 && (
          <div style={{ borderTop: '1px solid var(--theme-border)', maxHeight: '26vh', overflowY: 'auto' }}>
            {tape.map(t => (
              <div
                key={t.id}
                onClick={() => { setExpr(t.expr); inputRef.current?.focus() }}
                title="Click to reuse this expression"
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 14px',
                  cursor: 'pointer', fontSize: 12,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--theme-table-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                <span style={{ flex: 1, color: 'var(--theme-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.expr}</span>
                <span
                  onClick={e => { e.stopPropagation(); copy(t.result) }}
                  title="Click to copy"
                  style={{ color: 'var(--theme-text1)', fontWeight: 600 }}
                >
                  {copied === t.result ? '✓' : t.result.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tape footer */}
        {tape.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: '1px solid var(--theme-border)', fontSize: 12 }}>
            <span style={{ flex: 1, color: 'var(--theme-text3)' }}>Sum of tape</span>
            <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{tapeSum.toLocaleString()}</span>
            <button
              onClick={() => setTape([])}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-text3)', fontSize: 11, fontFamily: 'inherit', padding: 0 }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
