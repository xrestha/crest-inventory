---
target: POS module (src/modules/pos)
total_score: 27
p0_count: 0
p1_count: 2
p2_count: 2
timestamp: 2026-07-18T11-30-54Z
slug: src-modules-pos-pos-module
---
Method: dual-agent (A: acc8acc2d51cc31de · B: aa8c3e326fb972154), with Assessment B using real admin credentials to walk all three POS surfaces live (admin-authenticated, PIN staff login, public guest menu).

## Design Health Score — Nielsen's 10 Heuristics

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live KOT/BOT timers, offline sync banners, shift variance badges are excellent; error banners (`msg`, `addMsg`, `pinMsg`, `kdsError`) are plain text with no `role="alert"` almost everywhere |
| 2 | Match Between System and Real World | 4 | Genuinely excellent — KOT/BOT terminology, veg/non-veg dot convention, Z-report/shift language, hedged "about N min" instead of false-precision countdowns |
| 3 | User Control and Freedom | 2 | No modal in the entire module — shared `Modal.js` or any hand-rolled overlay — supports Escape to close; backdrop-click/Cancel still work so nothing traps the user |
| 4 | Consistency and Standards | 3 | Role-gating and destructive-confirm patterns are applied identically everywhere; undercut by the color/token drift below |
| 5 | Error Prevention | 3 | Shift double-close race guard, all-comped-order billing block, buyer-ID-required-on-discount, PIN lockout |
| 6 | Recognition Rather Than Recall | 3 | Live bill/comp-slip preview before printing; menu tiles show cart qty inline; no icon-only nav found |
| 7 | Flexibility and Efficiency of Use | 2 | Reports have full Excel export; the order-taking screen itself — the highest-frequency task — has zero keyboard acceleration and no bulk actions |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained, tasteful `color-mix()` tinting, one accent used sparingly; the floor-view status-strip pattern is deliberately reused, not novel per screen |
| 9 | Error Recovery | 3 | Errors are specific and near the source, non-blocking, form state preserved |
| 10 | Help and Documentation | 1 | No in-app help/walkthrough anywhere beyond `Tip` tooltips (what, not how) |
| **Total** | | **27/40** | **Acceptable — strong operational bones and real domain fluency, undercut by a third-module-in-a-row color-token bug and a few systemic a11y gaps** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** Zero gradient text, no glassmorphism, no hero-metric templates, no numbered eyebrows — this reads as a real, opinionated internal tool built by people who've watched a restaurant service happen.

**What both assessments converged on, independently, is the third occurrence of the same bug class the IMS and HR critiques each found once** — hardcoded colors bypassing the theme system — though the specific shape here is different and, in one place, worse: it's inside a *shared* component used by all three modules.

- **`src/components/Tip.js:24`** hardcodes `borderBottom: '1px dashed #4b5563'`. `Tip` is the tooltip mandated on every non-obvious label across the *entire app* (IMS+HR+POS per CLAUDE.md), so this fix radius is larger than POS alone — and it wasn't caught in the 2026-07-12 audit that fixed the same class of bug in `SearchableSelect.js`/`BsCalendarPicker.js`/`PremiumGate.js`/`ProtectedRoute.js`.
- **`PosOrders.jsx` lines 1881, 2041, 2071, 2092, 2494 and `PosShifts.jsx:489`** hardcode `color: '#fff'` on `background: var(--theme-green|red)` — the KOT/BOT "sent" badge, the Payment button, KOT/BOT pending-count badges, and the Void Order button. This is DESIGN.md's own named Accent-Text-Pairing bug, and the fix is *already in the same file*: `PosOrders.jsx:35` computes a contrast-aware `amberBadgeText` via `contrastRatio()` specifically because hardcoded text was already shown to fail on Light's amber — that fix just never got extended to green/red.
  **Live-verified** (Assessment B): forcing the Catppuccin preset (green `#a6e3a1`, red `#f38ba8` — both light pastels) and reloading `/pos/orders` showed visibly poor, likely WCAG-AA-failing white-on-pastel contrast on the "✓ BOT" badge, the Payment button, and the Void Order button — confirmed theme-dependent drift, not a universal design choice, via side-by-side screenshots against the Dark-theme baseline.
- **`PosOrders.jsx:1826`** uses `var(--theme-bg)` where the correct token is `var(--theme-accent-text)` (used correctly elsewhere: `GuestMenu.jsx:427`, `PosTableManagement.jsx:582`) — the two differ on 8 of 10 presets; it happens to look plausible rather than being an intentional choice.
- **`PosOrders.jsx:2148, 2208`** (detector, corroborating independently): a hardcoded amber-ish `rgba(245,158,11,·)` background paired with `color: var(--theme-amber)` — the background never tracks the actual active amber token (Dark `#fbbf24` vs. Latte `#df8e1d` vs. Bright `#d97706`), so text and background can visibly clash on non-Dark presets.

**Deterministic scan**: `detect.mjs --json src/modules/pos` exits 2, 38 findings — the large majority (print-template Courier New/black-text builders: `posOrderPrintHtml.js`, `parkingSlipHtml.js`, `creditNoteHtml.js`, `PosShifts.jsx`'s slip builder, `PosTableManagement.jsx:236`'s QR-slip print window, plus `#fff` QR-code backdrops in `PosOrders.jsx`) are confirmed false positives under the same print-exception and QR-quiet-zone reasoning already established for IMS/HR. The genuine remainder is exactly the color-token drift above — no new categories of finding beyond what's listed.

**Live evidence**: zero console errors or warnings across every route visited (admin-authenticated Orders/Tables/Staff/Shifts/Sales Report, the unauthenticated PIN login screen, and the public guest menu). The unauthenticated PIN login correctly showed a styled "this device isn't set up yet" fallback rather than a raw error. The public guest menu's own order-status badge, notably, uses the *correct* tinted-background/full-opacity-text style — the bug is specific to the admin-side `PosOrders.jsx`/`PosShifts.jsx` badges, not systemic to the whole module.

**One process note**: Assessment B's live walkthrough opened one real order (1× AMERICANO, sent to BOT) on Table 1 of the CASA ACAI CAFE test account to reach the billing screen, and left it un-closed (never paid or voided) per its no-destructive-actions instruction. That's a live, unpaid open order sitting in what may be more than a throwaway sandbox — flagging this so you can decide whether to void it yourself or have me do it; I didn't touch it without asking.

## Overall Impression

This is the most operationally mature of the three modules critiqued so far — the KOT/BOT delta system, the shift-close reconciliation guardrails, and the offline-first order queue all show real, hard-won thinking about what actually happens on a Nepali restaurant floor mid-service, not a demo-only happy path. The gap is narrow and mechanical: a handful of hardcoded colors (including one in a shared, cross-module component) that quietly break contrast on 3 of the 10 theme presets, plus a couple of systemic-but-fixable interaction gaps (no Escape-to-close anywhere, error banners screen readers can't hear). None of this touches the module's actual operational logic, which is its strength.

## What's Working

1. **The KOT/BOT delta system** (`sent_qty` tracking) — bumping a quantity or adding a note after a ticket already printed shows a `+N` badge and resets `sent_to_kot`, so the kitchen gets a correct delta ticket instead of a full reprint or a silent miss.
2. **Shift close reconciliation** — a double-close race guard, a pre-close "N orders still open" hard block, and a Balanced/variance badge make the single highest-anxiety moment for a cashier legible and safe.
3. **Offline-first order-taking** — conflict detection (an order closed elsewhere while offline surfaces as a discardable banner, never a silent overwrite) shows real thought about connectivity actually dropping mid-service.

## Priority Issues

**[P1] Hardcoded colors break theme correctness, including in a shared cross-module component** *(live-verified on Catppuccin)*
- **Why it matters**: `Tip.js`'s hardcoded border affects every tooltip in IMS+HR+POS. The `#fff`-on-green/red badges/buttons in `PosOrders.jsx`/`PosShifts.jsx` are concrete WCAG AA failures on 3 of 10 presets (Nord, Catppuccin, Tokyo Night) — on exactly the badges a rushed waiter glances at mid-rush. The fix pattern (`contrastRatio()`-based `amberBadgeText`) already exists 3 lines above the first offending instance in the same file.
- **Fix**: `Tip.js` → `var(--theme-border)` or `var(--theme-text3)`; the 6 hardcoded `#fff` instances → the existing contrast-aware pick or `var(--theme-accent-text)`; `PosOrders.jsx:1826` → `var(--theme-accent-text)` (not `--theme-bg`); the two hardcoded amber rgba instances → a token-derived `color-mix()`.
- **Suggested command**: `/impeccable harden`

**[P1] Billing modal decision density spikes exactly when the customer is waiting**
- **Why it matters**: When a discount or Credit is chosen, buyer Name/Address/PAN/Phone, discount reason, item comp reason, and (if split) a running tender ledger all surface at once on top of the base payment-method choice — 6+ simultaneous fields at the one moment real money changes hands and a customer is standing there, versus the fast single-tap close the rest of the app trains staff to expect.
- **Fix**: Collapse buyer-ID fields behind a disclosure that only expands when `requireBuyerId` is true (already conditionally *validated* — make it conditionally *rendered* too); visually separate "core payment" from "adjustments" so the primary path stays 2-3 fields.
- **Suggested command**: `/impeccable clarify`

**[P2] No modal in the module supports Escape-to-close**
- **Why it matters**: Not a blocker (backdrop-click/Cancel always work), but a real tax repeated dozens of times a shift across Recent Bills, Billing, Covers, Add Staff, Reset PIN, Manage Roles, Table Add/Edit — none of which share the base `Modal.js`, so there's no single place to fix it once.
- **Fix**: One `keydown`-for-`Escape` listener in `Modal.js`, plus the same few lines added to each hand-rolled overlay in `PosOrders.jsx` (which doesn't use the shared component).
- **Suggested command**: `/impeccable harden`

**[P2] POS error banners are invisible to screen readers**
- **Why it matters**: Every error/success message across the module renders as a plain `<p>` with colored text — only `PosLogin.jsx` uses `role="alert"`. A screen-reader user gets zero feedback that Add Staff failed, a PIN reset errored, or billing was blocked, for a product whose own PRODUCT.md commits to a WCAG AA baseline.
- **Fix**: Wrap these in `role="alert"`/`aria-live="polite"` the same way `PosLogin.jsx` and `GuestMenu.jsx`'s status card already do — the pattern exists, it's just inconsistently applied.
- **Suggested command**: `/impeccable harden`

**[P3] Guest menu doesn't earn its distinct register; KDS has no audio alert**
- **Why it matters**: PRODUCT.md explicitly calls `GuestMenu.jsx` out as the one deliberate brand-facing exception (a guest's own leisurely browsing moment) — but it reuses the identical `.card`/`.tab-bar`/`.btn-primary` vocabulary as every staff tool, with no Georgia serif moment for the outlet name. Separately, `KitchenDisplay.jsx` has no chime for new-ticket arrival despite the exact chime-synthesis pattern already existing and being used for guest-order and stage-change events elsewhere.
- **Fix**: Give the outlet name a Georgia moment on `GuestMenu.jsx`; reuse the existing chime synthesis in `KitchenDisplay.jsx`'s ticket-count-increase path.
- **Suggested command**: `/impeccable delight`

## Persona Red Flags

**Casey (rushed waiter, mobile/tablet, thumb-only)**: qty-stepper buttons are 40×40px — below the 44×44pt guideline, on the single most-tapped control on the busiest screen (the code's own comment admits this is a deliberate 320px-column compromise). The 320px-fixed cart panel plus flex-1 menu has no visible mobile breakpoint collapse, a real risk on a waiter's own phone rather than an owner-issued tablet. Positive: `savingRef`/`closingRef` re-entry guards specifically defend against double-tap-under-pressure causing duplicate orders — exactly the right defense already built.

**Jordan (first-time guest scanning a QR code)**: no help/support affordance on `GuestMenu.jsx` beyond "ask staff" text — no call-a-waiter button. Positive: the veg/non-veg dot convention matches what a Nepali/Indian diner already expects from a printed menu, and the hedged "about N min" order-status stepper gives real reassurance after placing an order into the void.

**Sam (screen reader/keyboard-only)**: the floor-view table grid does the right thing (`role="button"`, `tabIndex`, `onKeyDown` for Enter/Space) — genuinely keyboard-navigable. But the `role="alert"` gap (P2) and zero Escape-to-close (P2) mean a keyboard/screen-reader user hits far more friction than a mouse/touch user in the same flows — inconsistent, not uniformly weak.

## Minor Observations

- `PosLogin.jsx`'s numpad press-feedback is wired via `onMouseDown`/`onMouseUp` rather than CSS `:active` — works but an unusual pattern for what's ultimately a pseudo-class use case.
- No skeleton loading states anywhere in the module — every async fetch shows plain "Loading…" text, against product.md's explicit skeleton-over-spinner guidance; low severity since it's at least consistent everywhere.
- `window.confirm()` (native dialog) is used for all destructive deletes rather than the custom-styled confirm modals used elsewhere in the system — functionally fine, a visually jarring native interruption in an otherwise fully-themed product.
- The print-template builders (`posOrderPrintHtml.js`, `parkingSlipHtml.js`, `creditNoteHtml.js`, plus `PosShifts.jsx`'s inline slip builder) duplicate the same Courier-New/`color:#000` header block across at least 6 separate template strings — a shared print-CSS constant would remove the duplication (a code-reuse note, not a design one).
- `PosTableManagement.jsx:236`'s QR-slip print window inlines its print styling directly rather than using the same builder-file pattern as the other print templates — worth aligning for consistency, low priority.

## Questions to Consider

1. The billing modal's 1060px two-pane live-preview layout is genuinely nice on a desktop cashier station — but if Charge actually happens on the same tablet that took the order, would a slide-up sheet serve that device profile better than a wide two-pane layout?
2. `GuestMenu.jsx` is explicitly named as the one place brand personality is allowed to show — should the Georgia wordmark and more visual warmth extend there, or is "identical to the staff tools" the right call because a guest mid-meal doesn't want ceremony either?
3. KDS gets a bigger font and a color stage-strip for its across-the-room context, but still shares the standard desktop-report page shell (`padding: '20px 24px', maxWidth: 1400`) — does a wall-mounted, no-keyboard, viewed-from-6-feet screen deserve its own layout container?
