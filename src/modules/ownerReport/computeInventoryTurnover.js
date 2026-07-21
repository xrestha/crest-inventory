// Inventory turnover ratio / days-on-hand — no existing precedent anywhere in this codebase
// (confirmed by research pass), but built almost entirely from figures computeImsSection already
// computes. Pure function, no queries — takes the IMS section's own totals plus the period's
// day count.
export function computeInventoryTurnover({ openingStockValueTotal, closingStockValueTotal, purchaseTotal, monthDays }) {
  const opening = openingStockValueTotal || 0
  const closing = closingStockValueTotal || 0
  const cogsUsedValue = opening + (purchaseTotal || 0) - closing
  const avgInventoryValue = (opening + closing) / 2
  const turnoverRatio = avgInventoryValue > 0 ? cogsUsedValue / avgInventoryValue : null
  const daysOnHand = turnoverRatio != null && turnoverRatio > 0 ? monthDays / turnoverRatio : null
  return { cogsUsedValue, avgInventoryValue, turnoverRatio, daysOnHand }
}
