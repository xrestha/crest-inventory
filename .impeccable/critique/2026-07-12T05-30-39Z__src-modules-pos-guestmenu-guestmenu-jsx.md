---
target: GuestMenu.jsx
total_score: 27
p0_count: 1
p1_count: 2
timestamp: 2026-07-12T05-30-39Z
slug: src-modules-pos-guestmenu-guestmenu-jsx
---
Method: dual-agent (A: a3cdf9b914a78439d · B: a1ff210b07c17c43c)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | The 5-stage tracker is good ongoing status, but the highest-stakes moment (order submission) produces zero salient feedback |
| 2 | Match System / Real World | 4/4 | Plain-language stage labels, NPR prefix, veg/non-veg convention read fluently for the audience |
| 3 | User Control and Freedom | 3/4 | Steppers/backdrop-close/Order Again all work; no way to edit or cancel a submitted request, unexplained |
| 4 | Consistency and Standards | 3/4 | Mostly uses shared classes, but the Stepper bypasses `.btn` and the KOT badge drops the base `.badge` class |
| 5 | Error Prevention | 3/4 | Qty/covers clamped, submit disabled while in-flight |
| 6 | Recognition Rather Than Recall | 4/4 | Cart total always visible via the fixed bar |
| 7 | Flexibility and Efficiency | 2/4 | No search, no jump-to-category for a large menu |
| 8 | Aesthetic and Minimalist Design | 3/4 | Clean, single-accent, minor component drift noted above |
| 9 | Error Recovery | 2/4 | Network error and a legitimately-empty menu render the identical dead-end message; no retry; cart loss on refresh has no recovery |
| 10 | Help and Documentation | 1/4 | No help affordance anywhere except inside two failure states |
| **Total** | | **27/40** | **Acceptable — significant improvements needed, particularly around the submission moment and error differentiation** |

## Anti-Patterns Verdict

**LLM assessment**: Low risk of reading as AI-generated. The file correctly uses the app's own tokens (`.card`, `.btn-primary`/`.btn-ghost`, `var(--theme-*)`), sticks to the single Aged-Brass accent, and avoids purple gradients or a templated hero-plus-cards layout. The actual tell is component drift, not slop: a hand-rolled `Stepper` that ignores the shared button vocabulary, and a status badge missing its base `.badge` class.

**Deterministic scan**: Clean pass — `detect.mjs --json` returned exit code 0, zero findings. This is expected and not a contradiction: the 46 detector rules target visual/markup anti-patterns (gradients, eyebrow labels, contrast failures, layout smells), not the structural/behavioral issues the LLM review found (missing base class, no cart persistence, undifferentiated error states). The two assessments are complementary, not redundant — a clean detector pass on a file with a P0 issue is exactly why this critique runs both.

**Visual overlays**: Not available. No browser automation tool is exposed in this environment, so no live server, injection, or screenshot evidence was gathered. This critique is based on source-code review only.

## Overall Impression

This is a well-built, restrained page that mostly disappears into the task the way good product UI should — the 5-stage order tracker unifying two backend signals into one guest-facing timeline is genuinely well engineered. But the single moment that matters most to a paying guest (did my order actually go through?) is also the page's weakest moment: no toast, no scroll, no chime on a first order. The biggest opportunity is closing that gap, not a visual redesign — the visual language is already sound.

## What's Working

- **The 5-stage order tracker** unifies two separate backend signals (`pos_guest_order_requests.status` and `pos_kot_log`) into one coherent guest-facing timeline, with terminology deliberately mirrored from the staff-side badge — a real cross-surface consistency win.
- **The per-table remount guard** explicitly handles the shared-kiosk/back-navigation edge case (stale order status bleeding from a previous table) — thoughtful defensive engineering most guest-facing pages skip.
- **Token discipline**: every color is a `var(--theme-*)` reference; the one literal shadow on the floating cart button is DESIGN.md's own named exception for floating elements, not a violation.

## Priority Issues

**[P0] Order confirmation is invisible at the moment it matters most.**
- Why it matters: `placeOrder()` clears the cart and closes the modal with no toast, no scroll-to-top, and no chime (explicitly suppressed on a first order). The guest is dropped back onto the menu list wondering if anything happened.
- Fix: on success, scroll the `OrderStatusCard` into view and show a brief confirmation state before/as the modal closes.
- Suggested command: `/impeccable clarify`

**[P1] Cart has no persistence — any interruption silently destroys it.**
- Why it matters: `cart`, `covers`, and `guestNote` live only in React state; only a submitted request is written to `sessionStorage`. A phone lock or accidental tab switch mid-fill wipes the cart with zero warning.
- Fix: persist cart/covers/notes to `sessionStorage` on every change, rehydrate on mount, same pattern already used for `requestId`.
- Suggested command: `/impeccable harden`

**[P1] Network error and empty-menu render the identical dead-end message.**
- Why it matters: a transient RPC/network failure and a legitimately empty menu both show "Menu not available. Please ask staff for assistance." with no retry button.
- Fix: distinguish the two states; add a Retry action for the error case, reserve staff-escalation copy for the genuinely-empty case.
- Suggested command: `/impeccable harden`

**[P2] Status badge silently drops its shape.**
- Why it matters: the KOT status badge applies only the color class, never the base `.badge` class that supplies radius/padding from Layout.css — it paints color straight against the glyphs instead of forming the pill chip used everywhere else.
- Fix: `className={`badge ${KOT_STATUS_BADGE[kotStatus]}`}`
- Suggested command: `/impeccable polish`

**[P2] No way to navigate a long menu.**
- Why it matters: no search, no sticky category chips — a full-service restaurant/hotel menu with 30+ items across many categories forces pure linear scroll.
- Fix: sticky horizontal category-chip bar (reuse `.tab-btn`/`.tab-bar`) that scrolls each category section into view.
- Suggested command: `/impeccable layout`

## Persona Red Flags

**Casey (distracted mobile user)**:
- Cart is silently destroyed on any interruption (see P1) — Casey returns to nothing.
- Order confirmation lands off-screen wherever Casey had scrolled to, with no scroll or toast.
- The cart-review modal top-aligns rather than bottom-sheets, putting the close button and top items outside comfortable one-handed thumb reach, unlike the properly bottom-anchored "View Order" bar.

**Riley (deliberate stress tester)**:
- Reloading or opening a second tab mid-fill trivially reproduces the cart-loss bug.
- The kitchen-notes textarea has no client-side `maxLength`.
- Placing a second order right after the first is functionally allowed with zero messaging about whether that creates a second request or is a mistake.

**Jordan (confused first-timer)**:
- Nothing explains, before submission, that this is a *request* a staff member must Accept, not an instant order — could read as something being wrong to a guest expecting instant confirmation.
- The veg/non-veg indicator has zero text label; its only explanation is a `title` attribute that never fires on touch — a real gap for the product's hotel/tourist F&B segment.
- Zero help/contact affordance exists anywhere outside the two failure states.

## Minor Observations

- Covers stepper defaults to 2 (and again after "Order again") — an extra tap for every solo diner.
- Stepper +/− buttons have no `aria-label`; a screen reader announces only "minus"/"plus" with no item context.
- "+ Add" buttons carry no accessible name tying them to the specific item.
- Allergens surface as amber text only, no icon, for a safety-relevant callout.
- Nutrient tags have no cap on how many can wrap into a row.

## Questions to Consider

- If a guest closes the tab the instant they tap "Place Order," what's their actual recovery path beyond re-scanning the QR and hoping `sessionStorage` survived?
- DESIGN.md calls this the one deliberate brand-facing exception in the product, but visually it's nearly indistinguishable from any other card-and-badge internal screen — should it borrow more of the "confident, modern, approachable" personality, or is disappearing into the same system the right call?
- Would a simpler 3-stage view (placed / preparing / ready) cut cognitive load without losing anything real, versus the current 5-stage bar?
