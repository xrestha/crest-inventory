---
target: HR module (src/modules/hr)
total_score: 25
p0_count: 1
p1_count: 1
p2_count: 2
timestamp: 2026-07-18T10-49-06Z
slug: src-modules-hr-hr-module
---
Method: dual-agent (A: a3fbc8377df8d520b · B: a47d4d9efe7c189c0), with Assessment B using real admin credentials to walk the live HR routes this time (rather than a supplementary pass afterward).

## Design Health Score — Nielsen's 10 Heuristics

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | HrDashboard's loading skeleton + error-with-retry banner is genuinely strong — but Assessment B reproduced a real bug live: on an admin session with no client pre-selected, `/hr/dashboard` and `/hr/employees` hang on an infinite, silent "Loading…" with no error, no timeout, no way forward (downgraded from A's source-level 3 once B's live reproduction came in) |
| 2 | Match Between System and Real World | 3 | Excellent domain fidelity (BS calendar, TADA/SSF/TDS, Labour Act citations); assumes real accounting literacy in a few spots tooltips only partly soften |
| 3 | User Control and Freedom | 3 | Cancel/Reopen/Undo present almost everywhere; Roster's drag-select has no keyboard escape (ties into Heuristic 6 below) |
| 4 | Consistency and Standards | 2 | Copy-pasted `STATUS_COLORS` hex objects independently found in 3 files (`EmployeeList.jsx`, `Overtime.jsx`, `PaySetup.jsx`) reinventing the existing `badge-*` classes; 2 pages skip shared page-chrome entirely; a dead `page-container` CSS class used in 10 places with no actual rule |
| 5 | Error Prevention | 3 | Confirm dialogs on Finalize/Reopen/Delete/Settle/Reject; leave-conflict block-with-override on roster scheduling; PIN lockout on Self-Service login |
| 6 | Recognition Rather Than Recall | 3 | Tooltips on nearly every non-obvious column; formula-transparent calculation lines instead of asking the user to trust a black-box total |
| 7 | Flexibility and Efficiency of Use | 2 | Zero keyboard shortcuts anywhere; approval queues (Leave/OT/TADA) are one-row-at-a-time with no bulk approve; Roster's drag-to-multi-assign is the one real accelerator |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and appropriately dense per the system's own goals; undercut by the ad hoc color proliferation adding noise the system is designed to avoid |
| 9 | Help Recognize/Diagnose/Recover from Errors | 2 | Inline errors are specific and plain-language where they exist — but the infinite-spinner bug above means the *worst* failure mode in the module (a blank wait with zero recovery path) went completely unsurfaced (downgraded from A's source-level 3 for the same reason as #1) |
| 10 | Help and Documentation | 2 | `Help.js` covers HR substantially but nothing in the HR screens links to it contextually |
| **Total** | | **25/40** | **Acceptable — solid foundation and real craft in the payroll flow, undercut by a live-reproduced infinite-loading bug and recurring color-token drift** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** Both assessments agree — no gradient text, no glassmorphism, no hero-metric templates, no numbered eyebrows. Several screens (`PayrollCalculation.jsx`, `FinalSettlement.jsx`) show genuine design thought via an operator-annotated "show your work" formula ledger, not a templated pattern.

What both assessments converged on instead, independently and via different methods, is **a real erosion of the One Accent Rule through copy-paste color values** — this is the module's actual "slop," in the sense DESIGN.md itself defines it (a second uncoordinated saturated color creeping in).

**LLM design review (Assessment A)** found a hardcoded `#60a5fa` blue used as a de facto second accent across at least 6 files (`payrollConstants.js`, `PayrollRun.jsx`, `PaySetup.jsx`, `PayForm.jsx`, `FestivalAllowance.jsx`, `GratuityTracker.jsx`), plus Dark-preset-only hardcoded badge rgba values (not `var()`-based) in `EmployeeList.jsx` and `Overtime.jsx` that will show the wrong hue on all 9 non-Dark presets.

**Deterministic scan (Assessment B)** independently corroborated this from a different angle: `detect.mjs --json src/modules/hr` exits 2, 77 findings (75 color, 1 layout-transition, 1 side-tab). Of the color findings, **~63 are false positives** — 19 of 20 in `EmployeeJoiningForm.jsx` are inside a dedicated A4 print template (same established exception as IMS's print templates), and `Roster.jsx`/`ShiftSettingsPanel.jsx`'s shift colors are a legitimate per-client-editable color-picker column (`hr_shift_types.color`), analogous to a chart-series palette. But the detector *also* independently found the same duplicated-`STATUS_COLORS` problem A found — this time in `EmployeeList.jsx` **and `PaySetup.jsx`** (a third file beyond A's `Overtime.jsx`) — reinventing the existing `badge-green`/`badge-red`/`badge-gray` classes and even drifting from the established gray value while doing it. Two independent methods landing on the same root cause via different file pairs is strong corroboration this is systemic, not two isolated incidents.

Where the two assessments genuinely differ is **prescription, not diagnosis**: Assessment A's read is that the ad hoc blue/indigo/pink/cyan palette (Roster shift types, Leave types, pay-basis badges) should mostly be pulled back onto the existing signal/purple tokens. Assessment B's read, having traced the same 4 hex values back to shared constants (`payrollConstants.js`, `leaveConstants.js`) used consistently across 10+ files rather than one-off inline hacks, argues these are load-bearing categorical data colors that should be *formalized* as new documented tokens (`--theme-blue`, `--theme-indigo`, etc.) the same way `--theme-purple` itself once was. Both agree the *badge*-color duplication (STATUS_COLORS) is unambiguous drift that should just be deleted in favor of existing classes — the disagreement is narrower than it first looks, and is really about the Roster/Leave *category* colors specifically. This is a real design-intent fork worth your call (see the question below).

One additional, unambiguous real finding from the detector: `PayrollCalculation.jsx:375` hardcodes `#f59e0b` where `var(--theme-amber)` — a token that already exists and is already used correctly elsewhere on the same page — was the obvious choice. Not a new-color-need case; a plain miss.

**Live browser evidence** (Assessment B, with real credentials): confirmed zero console errors/warnings across every HR route in both Dark and Latte (light) themes, and confirmed the Roster board, Leave Types list, and empty-states all render correctly and legibly in both presets. But it also surfaced a real, reproducible functional bug neither the static review nor the detector could have caught from source alone: **on a fresh admin session with no "view as" client selected, `/hr/dashboard` and `/hr/employees` hang on an infinite, silent loading spinner** — traced to `HrDashboard.jsx:68` and `EmployeeList.jsx:67-68`, where an early-return guard (`if (!clientId) return`) skips the code path that would ever call `setLoading(false)`. This is promoted to the top Priority Issue below since it's a genuine, live-reproduced correctness bug, not a style preference.

## Overall Impression

This module's ceiling is genuinely high — `PayrollCalculation.jsx`'s operator-annotated formula ledger and `GratuityTracker.jsx`'s honest disclaimer about legal uncertainty ("a commonly applied assumption, not something confirmed in the Labour Act text") are exactly the kind of "precision over polish, but never obscure the actual figure" craft PRODUCT.md asks for, and they're rarer and harder to get right than most of what a critique usually finds. The floor is lower than the ceiling suggests: a real infinite-spinner bug that a fresh admin session will hit before ever seeing that good work, plus the same color-token discipline gap the IMS critique found, recurring here independently. The single biggest opportunity: the module clearly knows how to design for a non-technical owner under real financial stakes (Payroll) — it hasn't yet applied that same care to its second, structurally different audience (HR Self-Service on a phone), where the TADA claim form in particular is a straight copy of the desk-based admin form.

## What's Working

1. **`PayrollCalculation.jsx`'s operator-annotated formula ledger** turns genuinely hard domain logic (SSF, TDS's YTD-cumulative projection, OT double-counting) into a readable, step-by-step receipt instead of a trust-me total — exactly the "make an intimidating domain feel usable without diluting precision" brand promise, and `FinalSettlement.jsx`'s Formula column does the same for a rarer, higher-anxiety workflow.
2. **`GratuityTracker.jsx` and `FinalSettlement.jsx`'s honesty about legal uncertainty** — flagging an assumption as an assumption, not settled fact, is a rare and valuable design choice that serves the accountant-literacy audience PRODUCT.md calls out specifically.
3. **`HrDashboard.jsx`'s request-cancellation and error-surfacing work** — guarding against a stale admin-switch response repainting the wrong tenant's approval counts, and turning previously-silent query failures into a visible, dismissible, retryable banner — is unglamorous correctness work that directly protects an owner from acting on wrong numbers.

## Priority Issues

**[P0] Fresh admin session with no client selected → HR pages hang forever on a silent loading spinner** *(live-reproduced)*
- **Why it matters**: `HrDashboard.jsx:68` and `EmployeeList.jsx:67-68` both guard their data-load `useEffect` with `if (!clientId) return` / `if (effectiveClientId) { fetchEmployees() }` — but `setLoading(false)` only ever runs *inside* the guarded branch, so on a session where no client is selected yet, `loading` stays `true` permanently. No error, no timeout, no "select a client" prompt — just an indefinite skeleton. This is the worst possible failure mode (Heuristic 1 and 9 both fail on it) and will hit any admin who navigates to HR before using the sidebar client switcher.
- **Fix**: In both effects, call `setLoading(false)` (or render an explicit "select a client to continue" state) in the early-return branch, not just the happy path.
- **Suggested command**: `/impeccable harden`

**[P1] Roster Board shift assignment has no keyboard path at all**
- **Why it matters**: `Roster.jsx:760-817`'s roster-cell button wires only `onMouseDown`/`onMouseEnter` (plus a document-level `mouseup` listener) to drive drag-select-then-open-picker — no `onClick`, no `onKeyDown`. A keyboard-only or screen-reader-using manager can view a schedule but cannot build one at all. This is a hard wall on a core, recurring owner-facing workflow, not a rough edge on a secondary one.
- **Fix**: Add `onClick`/`onKeyDown` (Enter/Space) handling that opens `ShiftPicker` for a single-cell selection, reusing the existing 1×1-click code path rather than the drag-anchor state machine.
- **Suggested command**: `/impeccable harden`

**[P2] A hardcoded second accent color has proliferated across 6+ files, plus duplicated Dark-preset-only badge colors in 3 files** *(corroborated independently by both assessments)*
- **Why it matters**: `#60a5fa` functions as an uncoordinated second "brand" color (pay-basis badges, SSF figures, attendance status) across `payrollConstants.js`, `PayrollRun.jsx`, `PaySetup.jsx`, `PayForm.jsx`, `FestivalAllowance.jsx`, `GratuityTracker.jsx` — the exact failure DESIGN.md's One Accent Rule exists to prevent. Separately, `EmployeeList.jsx`, `Overtime.jsx`, and `PaySetup.jsx` each independently reinvent an identical `STATUS_COLORS` object hardcoding Dark-preset hex instead of using the existing `badge-green`/`badge-red`/`badge-gray` classes — these will show the wrong hue on all 9 non-Dark presets. `PayrollCalculation.jsx:375` also hardcodes `#f59e0b` where `var(--theme-amber)` was already the established, correct choice one line away.
- **Fix**: Delete the 3 duplicated `STATUS_COLORS` objects in favor of the existing badge classes. For the categorical blue/indigo/pink/cyan used for Roster shift types and Leave types specifically — decide (see the question below) whether to formalize them as new documented tokens or consolidate onto the existing palette; either way, stop the drift from spreading further.
- **Suggested command**: `/impeccable harden`

**[P2] TADA claim submission has identical field density on the owner-facing admin screen and the mobile Self-Service screen**
- **Why it matters**: `SelfServiceHome.jsx`'s TADA tab is a near-duplicate of `TadaClaims.jsx`'s "New Claim" modal — start-point and purpose preset/custom toggles, a destination vendor sub-picker, dynamic expense line items, a Transport-specific vehicle-type+distance sub-form, all rendered flat with no staging. HR Self-Service is architecturally a deliberately separate, simpler surface for a different audience (PIN-based mobile login, distinct RLS) per CLAUDE.md — but the TADA experience doesn't act on that distinction at all. An hourly worker filing a claim from their phone on a break gets the same cognitive load as an admin at a desk.
- **Fix**: For the self-service surface specifically, break the form into progressive steps (trip details → one expense at a time → review/submit) and move the tab bar / primary action toward the thumb zone instead of the current top-of-screen placement.
- **Suggested command**: `/impeccable clarify`

**[P3] Page-chrome and layout consistency gaps**
- **Why it matters**: `page-container` is used in 10 places (`HrDashboard.jsx`, `EmployeeList.jsx`, `Overtime.jsx`, `HolidayCalendar.jsx`, others) but has no corresponding CSS rule anywhere in the codebase — it's dead. `Advances.jsx` and `TadaClaims.jsx` skip the shared page-header pattern entirely for a hand-rolled `<h2>` + ad hoc padding. Separately, `PayrollCalculation.jsx`, `PayrollRun.jsx`, and `FestivalAllowance.jsx` use a fixed non-responsive `repeat(4/5, 1fr)` grid instead of the shared `.stat-grid` class every other HR stat row uses — notably clustered on the module's highest-stakes payroll pages.
- **Fix**: Add the missing `.page-container` rule or strip the dead classname from all 10 call sites; align `Advances.jsx`/`TadaClaims.jsx` onto the standard page-header pattern; swap the 3 fixed grids for `className="stat-grid"`.
- **Suggested command**: `/impeccable harden`

## Persona Red Flags

**Sam (Accessibility)**: Roster Board's shift assignment (P1 above) is entirely mouse-driven with no keyboard equivalent for either single-cell or multi-day drag-assignment; the on-leave conflict indicator relies on a `title` tooltip as its only text alternative to a diagonal-stripe-plus-color visual cue, which isn't screen-reader-reliable the way a visible label would be.

**Alex (Power User)**: zero keyboard shortcuts anywhere in the module; Leave/OT/TADA approval queues are one-row-at-a-time with no bulk-approve, despite HrDashboard funneling exactly this batch of decisions into one place for a manager to clear before a payroll run. Roster's drag-to-multi-assign is the one genuine accelerator in the module — proof of what's missing elsewhere.

**Casey (Mobile/Self-Service)**: the Self-Service tab bar sits at the top of the screen, not the thumb zone; the default active tab (`payslip`) is the *last* item in left-to-right tab order, a small mismatch with natural scanning; the TADA form (P2 above) is the one part of self-service that doesn't respect this persona at all. Separately (not an HR-specific finding, but observed live while testing HR routes at a narrow viewport): the sidebar's floating hamburger toggle visually overlaps and truncates the page H1 ("Employees" → "ployees", "HR Dashboard" → "Dashboard") below a certain width — this is almost certainly a `Layout.js`-level responsive bug affecting every module, not something specific to HR, but worth a dedicated look since it was directly observed here.

## Minor Observations

- `src/modules/hr/Hr.js` is a "coming soon" stub confirmed (via grep, by both assessments independently) to be dead code — not imported anywhere in `App.js` or the rest of `src`. Safe to delete.
- `EmployeeJoiningForm.jsx:108` — the on-screen (not print-only) "Close" button hardcodes `border: '1px solid #374151'` instead of `var(--theme-border)`. Low severity, easy fix.
- `GratuityTracker.jsx:174` — an informational callout card uses `borderLeft: '3px solid var(--theme-accent)'`, the visually-recognizable side-stripe pattern the detector flags on principle, even though it's token-based rather than a literal hex. A single instance, not a repeated pattern.
- `Advances.jsx:313` — a repayment progress bar animates `width` instead of `transform: scaleX()`; same category as the IMS critique's earlier finding, low real-world impact for one small bar.
- `Advances.jsx`/`TadaClaims.jsx` hardcode `rgba(201,168,76,0.07)` for a selected-row tint — same Dark-preset-only hex pattern as the P2 finding, worth folding into that same cleanup pass.
- `HrReports.jsx` has 6 tabs (Roster/Summary/SSF/Bank/TDS/Certificate) — at the edge of, not over, the working-memory guideline; no action needed now, worth watching before a 7th is added.
- `EmployeeList.jsx`'s "Enable Self-Service" PIN modal correctly uses `autoComplete="new-password"` per CLAUDE.md's PIN-field rule — confirms the team is actively applying that lesson, not just documenting it.
- `Roster.jsx` recreates per-cell inline style objects on every render for potentially 1,200+ cells (30 days × 40 employees) — not a design issue, but worth a performance look if a large-roster client reports sluggishness.

## Questions to Consider

1. `PayrollCalculation.jsx`'s "show your work" formula ledger is the module's best idea — should that same operator-annotated treatment extend to Festival Allowance and Overtime, which compute equally non-obvious numbers but only show the final figure today?
2. Is TADA meant to be one feature wearing two skins, or does HR Self-Service need a fundamentally lighter-weight submission flow (photo-of-receipt-first, fields-second) rather than a shrunk copy of the desk-based form?
3. Now that Roster shift types and Leave types have organically produced ~10 ad hoc categorical hex colors across shared constants, is it time to formalize a second rationed categorical palette in DESIGN.md (Assessment B's read), or pull them back onto the existing token set (Assessment A's read)?
