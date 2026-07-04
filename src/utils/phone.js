// Canonicalizes free-text phone input for matching/dedup — buyer_phone on pos_orders has
// zero format validation today (raw whatever-the-cashier-typed), so "+977-98-4123-4567",
// "9841234567", and "098 4123 4567" all need to resolve to the same key for loyalty/RFM/
// digital-receipt lookups. Mirrors the phone_canonical generated column added to
// pos_customers (see README.md SQL log) — keep the two in sync if this logic changes.
export function normalizePhone(raw) {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('977') && digits.length > 10) digits = digits.slice(3)
  digits = digits.replace(/^0+/, '')
  return digits.length >= 7 ? digits : null
}
