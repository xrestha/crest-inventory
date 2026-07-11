// Centered modal overlay — hosts a create/edit form so it pops up in front of the
// user instead of rendering at the top of the page (no scrolling to reach it).
// Backdrop click and the × button both call onClose; the panel itself stops propagation.
export default function Modal({ onClose, title, children, maxWidth = 960 }) {
  return (
    <div
      onClick={onClose}
      className="no-print"
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)',
        overflowY: 'auto', padding: '40px 16px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth, margin: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--theme-text1)' }}>{title}</h3>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 18, lineHeight: 1, padding: '2px 10px', marginTop: -4 }}
            onClick={onClose}
            title="Close"
          >×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
