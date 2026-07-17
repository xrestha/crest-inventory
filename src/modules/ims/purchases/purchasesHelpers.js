// Shared by Purchases.js, PurchaseBillModal.jsx, and ReturnsTab.jsx.
// Returns the effective conversion factor (>1) for an item, or 1 if no conversion set.
export function getCf(item) {
  const cf = parseFloat(item?.conversion_factor)
  return (cf > 1 && item?.purchase_unit) ? cf : 1
}

// Bill-level totals: taxable/non-taxable base, discount, VAT, grand total. Discount is spread
// proportionally across taxable/non-taxable before VAT — VAT applies only to the taxable portion
// net of its share of the discount. Shared by PurchaseBillModal's live total and the auto-printed
// PurchaseBillPrint voucher so the two can never drift apart.
export function calcBillTotals(lines, discountAmt) {
  const taxableBase    = lines.reduce((s, l) => l.vat_inclusive ? s + (parseFloat(l.qty)||0) * (parseFloat(l.rate)||0) : s, 0)
  const nonTaxableBase = lines.reduce((s, l) => !l.vat_inclusive ? s + (parseFloat(l.qty)||0) * (parseFloat(l.rate)||0) : s, 0)
  const subTotal  = taxableBase + nonTaxableBase
  const discount  = parseFloat(discountAmt) || 0
  const vatTaxable = subTotal > 0 ? taxableBase * (1 - discount / subTotal) : 0
  const vatTotal    = vatTaxable * 0.13
  const grandTotal  = subTotal - discount + vatTotal
  return { taxableBase, nonTaxableBase, subTotal, discount, vatTotal, grandTotal }
}
