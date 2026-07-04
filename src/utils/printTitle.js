// The browser's "Save as PDF" dialog suggests document.title as the default filename — the
// app's <title> is a static "Crest Inventory" (public/index.html), so every print button
// across IMS/HR/POS defaulted to that instead of something useful. Call this instead of
// window.print() directly: it sets a descriptive title just before printing and restores the
// original on the `afterprint` event rather than the line right after print() — in Chrome/Edge,
// print() returns immediately since the dialog is non-blocking, so restoring right away would
// revert the title before the dialog ever reads it.
export function printWithTitle(title) {
  const prevTitle = document.title
  document.title = title
  const restore = () => { document.title = prevTitle; window.removeEventListener('afterprint', restore) }
  window.addEventListener('afterprint', restore)
  window.print()
}
