// Shared Gross/Discount/Taxable/Non-Taxable/VAT/Net math for a POS order — extracted from
// PosOrders.jsx's buildBillHtml so the Credit Note print layout and the One Lakh Above Report
// compute amounts identically to the original bill instead of re-deriving the formula.

export function computeOrderAmounts(order, items, vatReg) {
  const subEx    = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const vatAmtRaw = vatReg ? items.reduce((s, i) => s + i.qty * i.unit_price * (i.vat_rate ?? 0), 0) : 0
  const discount = order.discount_amount || 0
  // Discount reduces the pre-VAT taxable base; VAT is recalculated on the discounted amount
  // (same rule as purchase_entries.discount_amount) — a proportional/blended-rate simplification
  // since this is an order-level (not per-line) discount.
  const discRatio = subEx > 0 ? discount / subEx : 0
  const vatAmt   = vatAmtRaw * (1 - discRatio)
  const grossAmt = subEx
  const rawNet   = grossAmt - discount + vatAmt
  const net      = Math.round(rawNet) // rounded to the nearest rupee so Net Amount matches the amount-in-words line
  const roundOff = net - rawNet
  const taxableBaseRaw    = vatReg ? items.filter(i => (i.vat_rate ?? 0) > 0).reduce((s, i) => s + i.qty * i.unit_price, 0) : 0
  const nonTaxableBaseRaw = vatReg ? items.filter(i => !(i.vat_rate > 0)).reduce((s, i) => s + i.qty * i.unit_price, 0) : subEx
  const taxableBase    = taxableBaseRaw * (1 - discRatio)
  const nonTaxableBase = nonTaxableBaseRaw * (1 - discRatio)
  const totalQty = items.reduce((s, i) => s + i.qty, 0)

  return { grossAmt, discount, taxableBase, nonTaxableBase, vatAmt, net, roundOff, totalQty }
}

// Same discRatio proportional-discount-allocation rule as computeOrderAmounts, applied per
// category instead of collapsed to one order-level total — so category subtotals always
// reconcile exactly to what computeOrderAmounts reports for the same order.
export function computeCategoryAmounts(order, items, vatReg) {
  const subEx = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const discRatio = subEx > 0 ? (order.discount_amount || 0) / subEx : 0
  const byCat = {}
  for (const i of items) {
    const cat = i.category || 'Uncategorized'
    const line = i.qty * i.unit_price
    const vatLine = vatReg ? line * (i.vat_rate ?? 0) : 0
    const b = byCat[cat] = byCat[cat] || { gross: 0, discount: 0, taxable: 0, nonTaxable: 0, vat: 0, qty: 0 }
    b.gross += line
    b.discount += line * discRatio
    b.vat += vatLine * (1 - discRatio)
    if (vatReg && (i.vat_rate ?? 0) > 0) b.taxable += line * (1 - discRatio)
    else b.nonTaxable += line * (1 - discRatio)
    b.qty += i.qty
  }
  return byCat
}

// Same discRatio proportional-discount-allocation rule again, keyed by recipe_id instead of
// category — a plain item-wise sales ledger, subtotals reconcile exactly to the order total.
export function computeItemAmounts(order, items, vatReg) {
  const subEx = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const discRatio = subEx > 0 ? (order.discount_amount || 0) / subEx : 0
  const byItem = {}
  for (const i of items) {
    const key = i.recipe_id || i.name
    const line = i.qty * i.unit_price
    const vatLine = vatReg ? line * (i.vat_rate ?? 0) : 0
    const b = byItem[key] = byItem[key] || { name: i.name, gross: 0, discount: 0, taxable: 0, nonTaxable: 0, vat: 0, qty: 0 }
    b.gross += line
    b.discount += line * discRatio
    b.vat += vatLine * (1 - discRatio)
    if (vatReg && (i.vat_rate ?? 0) > 0) b.taxable += line * (1 - discRatio)
    else b.nonTaxable += line * (1 - discRatio)
    b.qty += i.qty
  }
  return byItem
}
