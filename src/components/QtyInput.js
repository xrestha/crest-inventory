import { useState } from 'react'
import { evaluate, looksLikeExpression } from '../utils/evalMath'

// A numeric field that also accepts arithmetic: type "3*24+7" in a stock-count box and it
// commits 79. Counting stock is full of this ("3 cartons of 24 plus 7 loose"), and doing the
// sum elsewhere then typing the answer back is where transcription errors get in.
//
// The important invariant: the raw expression lives ONLY in this component's local `draft`.
// The parent is only ever handed a number (or ''), so live totals, COGS math, offline queue
// entries and DB writes can never see a half-typed "3*24" and parseFloat it down to 3.
//
// Plain numeric typing is passed straight through on every keystroke exactly as the old
// <input type="number"> did — the deferred-commit path only engages once the text actually
// contains an operator, so nothing about the normal case changes.
//
// Note this renders type="text", since type="number" refuses to hold "3*24" at all.
// inputMode="decimal" keeps the numeric keypad on mobile, and the spinners it loses were
// already hidden by CSS on the mobile stock inputs.
export default function QtyInput({
  value,
  onChange,
  onCommit,
  wrapperStyle,
  disabled,
  ...rest
}) {
  const [draft, setDraft] = useState(null) // non-null only while focused

  const asText = value === '' || value == null ? '' : String(value)
  const shown = draft !== null ? draft : asText

  const isExpr = draft !== null && looksLikeExpression(draft)
  const preview = isExpr ? evaluate(draft) : null

  function handleChange(e) {
    const raw = e.target.value
    setDraft(raw)
    // Only mirror plain numbers upward while typing. An in-progress expression deliberately
    // leaves the parent on its last good value so row totals don't flicker through nonsense.
    if (!looksLikeExpression(raw)) onChange?.(raw)
  }

  function commit() {
    if (draft === null) return
    const raw = draft.trim()
    let next

    if (raw === '') {
      next = ''
    } else if (looksLikeExpression(raw)) {
      const result = evaluate(raw)
      // An incomplete or malformed expression ("3*", "2+(4") reverts rather than committing a
      // partial reading of it.
      next = result === null ? (value ?? '') : result
    } else {
      next = raw
    }

    setDraft(null)
    onChange?.(next)
    onCommit?.(next)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      e.currentTarget.blur()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(null)
      e.currentTarget.blur()
    }
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block', ...wrapperStyle }}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        disabled={disabled}
        onChange={handleChange}
        onFocus={() => setDraft(asText)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        {...rest}
      />
      {isExpr && (
        <span
          style={{
            position: 'absolute', right: 0, bottom: '100%', marginBottom: 3,
            fontSize: 11, fontWeight: 700, lineHeight: 1.4,
            padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 5,
            background: 'var(--theme-card)',
            border: `1px solid ${preview === null ? 'rgba(248,113,113,0.45)' : 'rgba(201,168,76,0.45)'}`,
            color: preview === null ? 'var(--theme-red)' : 'var(--theme-accent)',
          }}
        >
          {preview === null ? '⌫ incomplete' : `= ${preview.toLocaleString()}`}
        </span>
      )}
    </span>
  )
}
