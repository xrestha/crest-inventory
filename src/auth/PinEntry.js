import React, { useState } from 'react'

// 4-digit PIN entry for floor use (POS cashiers, waiters, kitchen)
// Faster than email login during service — PIN stored hashed in shared_users
export default function PinEntry({ onSuccess, onCancel, label = 'Enter PIN' }) {
  const [pin, setPin] = useState('')

  function handleDigit(d) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) {
      onSuccess?.(next)
      setPin('')
    }
  }

  function handleClear() { setPin('') }

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div style={{ padding: 32, maxWidth: 240, margin: '0 auto', textAlign: 'center' }}>
      <p style={{ marginBottom: 16, color: '#94a3b8' }}>{label}</p>
      <div style={{ fontSize: 24, letterSpacing: 12, marginBottom: 24 }}>
        {'●'.repeat(pin.length)}{'○'.repeat(4 - pin.length)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {digits.map((d, i) => (
          <button
            key={i}
            disabled={!d}
            onClick={() => d === '⌫' ? handleClear() : handleDigit(d)}
            style={{
              padding: '14px 0',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: d ? 'rgba(255,255,255,0.05)' : 'transparent',
              color: '#e2e8f0',
              fontSize: 18,
              cursor: d ? 'pointer' : 'default',
            }}
          >
            {d}
          </button>
        ))}
      </div>
      {onCancel && (
        <button onClick={onCancel} style={{ marginTop: 16, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
      )}
    </div>
  )
}
