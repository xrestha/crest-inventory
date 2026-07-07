// Escapes free-text values before they're interpolated into a hand-built HTML string (thermal
// print templates in posOrderPrintHtml.js/creditNoteHtml.js/PosShifts.jsx/PosTableManagement.jsx
// — none of these go through React's JSX escaping since they're plain template-literal strings
// written via document.write/w.print). Without this, a buyer name, item note, shift label, or
// table name containing HTML/script executes with same-origin access to the live app the next
// time that document prints or reprints — see the window.open(noopener) fix alongside this file's
// usage for the second half of the mitigation.
export function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
