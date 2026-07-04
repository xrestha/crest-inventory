# Crest POS — Consolidated To-Do List

Living checklist compiled from: the competitor "IMS" ERP report-menu audit, the IRD POS compliance research (VAT Rules 2053 / Electronic Billing Procedure 2074), and a Nepal-POS-market feature scan (NRestro, Restronp, RestroX, Petpooja). Updated as features ship — completed items are struck through, not deleted, so this stays a full history of what was considered.

**Status key:** 🔴 Missing · 🟡 Partial · 🔵 Deferred (decided to postpone) · ⚪ Open question (not engineering)

Last updated: 2026-07-04 (S236)

---

## A. Core feature gaps (Nepal-market research, 2026-07-04)

- [ ] 🔴 Guest-facing QR digital menu (self-browse/self-order via table QR — Crest's only QR use today is payment)
- [ ] 🔴 Multi-branch/multi-outlet management (Crest is single-location per client)
- [ ] 🔴 Delivery aggregator integration (Foodmandu/Pathao-style — confirmed real gap via a competitor's "Direct Party" customer category)
- [ ] 🟡 Loyalty/rewards program (Customers page tracks contact + credit ledger, no points/rewards mechanic)
- [ ] 🔴 Kitchen Display System — on-screen KDS, not just printed KOT/BOT tickets

## B. Reports — compliance-adjacent

- [x] ~~Purchase-side One Lakh Above / Annexure 13 (vendor-wise)~~ — shipped S235, 2026-07-04. `src/pages/PurchaseOneLakhAboveReport.js`, `/purchase-one-lakh-report`. Reuses `buildVendorSummary` (now exported from `VatReport.js`) across a full BS fiscal year's `periodIds`, same missing-PAN/Annexure-13 badge convention as the POS-side report. Gated on the existing `vat_report` feature flag — no new flag/migration.
- [ ] 🟡 `sales_entries`/`purchase_entries` hard-delete on edit (accepted risk — only matters near the NRs 5 crore certification tier; `pos_orders` itself never hard-deletes once billed, verified)
- [ ] ⚪ Tier-1 software-certification legal question (needs an accountant's answer, not code)

## C. Reports — analytics / competitor parity (confirmed non-mandatory, pure business intelligence)

- [x] ~~Category Wise Sales Report~~ — shipped S235, consolidated into `/pos/sales-report` (Category Wise tab). New `computeCategoryAmounts()` helper in `posBillingMath.js` (per-category discount allocation, reconciles to order totals). "Return" = whole-bill Credit Notes (no partial/line-level return exists).
- [x] ~~Customer Wise Sales Report~~ — shipped S235, consolidated into `/pos/sales-report` (Customer Wise tab).
- [x] ~~Hourly Sales Report~~ — shipped S235, consolidated into `/pos/sales-report` (Hourly tab). Buckets `pos_orders.closed_at` by local hour-of-day, Recharts bar chart + table.
- [x] ~~Daily Sales Report~~ — shipped S235 (added mid-consolidation, not originally on this list). `/pos/sales-report` (Daily tab). Groups by BS calendar day; excludes Credit-Noted bills entirely (the revenue correction posts on the day the note is issued, not retroactively).
- [x] ~~Item Wise Sales Report~~ — shipped S236, 2026-07-04. 6th tab in `/pos/sales-report`. New `computeItemAmounts()` helper in `posBillingMath.js`, same Sales/Return-on-credit-note pattern as Category Wise.
- [x] ~~KOT Register Report~~ — shipped S236, 2026-07-04. `/pos/kot-log` (Register tab). Required a new `pos_kot_log` table — no historical send log existed before this (`sent_to_kot` was a live boolean, overwritten in place, no timestamp/sender).
- [x] ~~KOT vs Prebill vs Sales reconciliation~~ — shipped S236, 2026-07-04. `/pos/kot-log` (Reconciliation tab). Flags items whose total sent-to-kitchen qty exceeds their current order qty, and any KOT/BOT send on an order that ends up Voided. Only shows flagged rows.
- [ ] 🔴 Stock Ageing Report (FIFO/Expiry shows dates, not aging buckets)
- [ ] ⚪ "Supplier Wise" / "Product Type Wise" sales reports (unclear fit vs Crest's data model — needs clarification before scoping)

## D. Known roadmap items

- [ ] 🟡 Item-level Complimentary/comp (currently whole-order only)
- [ ] 🔴 QR payment auto-confirmation (webhook, order auto-marks paid — low priority, needs per-client merchant onboarding)
- [ ] 🔵 Payment QR rail coverage (eSewa rejecting NepalPay/NCHL QR — deferred, test Plan A later)
- [ ] 🔴 Offline mode (IndexedDB queue for POS itself, not just Stock Count)
- [ ] 🔴 Barcode support (structural, no current need identified)

## Not on this list (deliberately out of scope)

Full double-entry accounting / Chart of Accounts / Debtors-Creditors, multi-warehouse, batch/lot tracking, Production Entry transactions — confirmed general-ERP scope creep, not aligned with Crest's F&B cost-intelligence positioning.

---

## Shipped (for reference — moved here once complete)

- [x] ~~Item Wise Sales Report + KOT Log (Register + Reconciliation)~~ — shipped S236, 2026-07-04. New `pos_kot_log` table (append-only send-event log with delta-aware item/qty snapshots) backing `/pos/kot-log`; Item Wise added as `SalesReport.jsx`'s 6th tab.
- [x] ~~Sales Report — Daily / Hourly / Category Wise / Customer Wise / 1L+ (Annexure 13), one tabbed page~~ — shipped S235, 2026-07-04. `src/modules/pos/reports/SalesReport.jsx`, `/pos/sales-report`. Originally built as 4 separate pages same session, then consolidated into one shared-fetch tabbed page after Aashish pointed out it should mirror the competitor's single "Sales Report" menu structure. Daily/Hourly/Category/Customer share one BS date-range fetch (`useMemo`'d per-tab aggregation); 1L+ Report keeps its own Fiscal Year selector since Annexure 13 is a whole-year compliance check, not an arbitrary range.
- [x] ~~Purchase-side One Lakh Above / Annexure 13~~ — shipped S235, 2026-07-04. `src/pages/PurchaseOneLakhAboveReport.js`, `/purchase-one-lakh-report`. Reuses `buildVendorSummary` (now exported from `VatReport.js`).
- [x] ~~Credit Note workflow (VAT Rules 2053, Rule 20)~~ — shipped S234, 2026-07-03
- [x] ~~IMS stock deduction trigger~~ — shipped, verified 2026-07-03
- [x] ~~Discount controls (₨/% toggle, mandatory reason)~~ — shipped S219
- [x] ~~Credit payment method~~ — shipped S220
- [x] ~~Customers table + Credit collection~~ — shipped S221
- [x] ~~Sales Exception Report~~ — shipped S222
- [x] ~~Shift management (X/Z report)~~ — shipped S224
