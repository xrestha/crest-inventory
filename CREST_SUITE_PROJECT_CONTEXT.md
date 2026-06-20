# CREST SUITE — PROJECT CONTEXT DOCUMENT
### For Claude Code Reference
**Crest Hospitality (Pvt. Ltd.) | Kathmandu, Nepal | Confidential**

---

## 1. COMPANY OVERVIEW

**Company:** Crest Hospitality (Pvt. Ltd.)
**Location:** Kathmandu, Nepal
**Type:** Hospitality Technology and Services Company
**Stage:** Early Revenue — Pilot client live (Casa Acai Café)
**Vision:** Nepal's first integrated hospitality management platform

---

## 2. THE PRODUCT — CREST SUITE

Crest Suite is a single React + Supabase web application that serves as a complete hospitality operating system. It is **not** three separate apps. It is **one codebase** with **feature flags** that control what each client sees based on their subscription.

### Three Core Modules

| Module | Full Name | Purpose |
|---|---|---|
| Crest IMS | Inventory Management System | BOH cost control, purchasing, recipes, stock |
| Crest POS | Point of Sale | FOH order taking, billing, payments, shifts |
| Crest HR | Human Resource Management | Employees, payroll, rostering, SSF, TDS |

### Architecture Principle
> One codebase. One database. Feature flags per client. Three modules. Sell separately or as a bundle.

---

## 3. TECH STACK

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React (Create React App) | Single codebase for all three modules |
| Backend / Database | Supabase (PostgreSQL) | One Supabase project — all modules share same DB |
| Hosting | Vercel | Single deployment |
| Mobile | PWA (Progressive Web App) | Offline-first via service worker + IndexedDB |
| Auth | Supabase Auth + PIN | Email login for setup, 4-digit PIN for floor use |
| Offline Storage | IndexedDB | Queues transactions when offline |
| Background Sync | Service Worker | Auto-syncs to Supabase on reconnection |
| Excel Export | SheetJS | Owners and accountants want Excel output |
| Receipt Printing | ESC/POS protocol | 80mm thermal printers |

### Nepal-Specific Requirements (CRITICAL)
- **Calendar:** Bikram Sambat (BS) — all dates, periods, and reports in BS with AD conversion
- **Currency:** NPR (Nepalese Rupees) — no other currency
- **VAT:** 13% — configurable per item (some items exempt)
- **SSF:** Social Security Fund — employer 20% + employee 11% of basic salary
- **Income Tax:** Nepal slab-based TDS (see HR module)
- **Payment Gateways:** eSewa, Khalti, FonePay, ConnectIPS, cash, card
- **Language:** English UI — Nepali number formatting where required

---

## 4. SUBSCRIPTION AND FEATURE FLAGS

### The clients Table — Master Control

```javascript
{
  id: "uuid",
  name: "Casa Acai Café",

  // Module switches — the on/off toggles
  ims_enabled: true,
  pos_enabled: true,
  hr_enabled: true,

  // Plan per module — "starter" | "growth" | "pro" | null
  ims_plan: "growth",
  pos_plan: "growth",
  hr_plan: "growth",

  // Billing
  subscription_plan: "suite_growth",   // see pricing section
  billing_cycle: "monthly",            // "monthly" | "annual"
  monthly_rate: 22000,
  annual_rate: 16500,                  // monthly equivalent at 25% discount
  discount_pct: 0,                     // 0 for monthly, 25 for annual

  active: true,
  created_at: "timestamp"
}
```

### How Feature Flags Work in React

```javascript
// Global context — loaded once on login
const { ims_enabled, ims_plan, pos_enabled, pos_plan, hr_enabled, hr_plan } = useClientFeatures();

// Module-level check — hides entire module if disabled
{ims_enabled && <NavItem to="/inventory" label="Inventory" />}
{pos_enabled && <NavItem to="/pos" label="Point of Sale" />}
{hr_enabled && <NavItem to="/hr" label="Human Resources" />}

// Plan-level check — hides features within a module based on plan
{hr_enabled && hr_plan !== "starter" && (
  <NavItem to="/hr/roster" label="Staff Rostering" />
)}

{hr_enabled && hr_plan === "pro" && (
  <NavItem to="/hr/analytics" label="Labour Analytics" />
)}
```

### Locked Feature UI
Features on higher plans show a lock badge — not hidden, but upgrade-prompted:
```
[ Staff Rostering  🔒 Upgrade to Growth — NPR 3,000/month more ]
```

### Row Level Security (Supabase RLS)
Database-level enforcement — even if someone bypasses the frontend, they cannot query disabled module tables:
```sql
CREATE POLICY "ims_access" ON ims_purchases
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shared_clients
      WHERE id = auth.jwt()->>'client_id'
      AND ims_enabled = true
    )
  );
```

### Upgrading a Client
Two SQL field updates — effective on next login. No migration, no redeployment:
```sql
UPDATE shared_clients
SET pos_enabled = true,
    ims_enabled = true,
    pos_plan = 'growth',
    ims_plan = 'growth',
    subscription_plan = 'suite_growth',
    monthly_rate = 22000,
    annual_rate = 16500
WHERE id = 'client-uuid';
```

---

## 5. PRICING

### Plan Name Convention
| Old Name | Confirmed Name |
|---|---|
| Basic | **Starter** |
| Standard | **Growth** |
| Premium | **Pro** |

---

### Individual Module Pricing
All three modules — Crest IMS, Crest POS, Crest HR — have identical pricing across all tiers.

| Plan | Monthly | Annual /month | Annual Total | Saving/year |
|---|---|---|---|---|
| **Starter** | NPR 5,000 | NPR 3,750 | NPR 45,000 | NPR 15,000 |
| **Growth** | NPR 8,000 | NPR 6,000 | NPR 72,000 | NPR 24,000 |
| **Pro** | NPR 12,000 | NPR 9,000 | NPR 1,08,000 | NPR 36,000 |

Annual discount: **25% off monthly rate**

---

### Suite Bundle Pricing
Suite = all three modules (IMS + POS + HR) at the same plan tier.

| Suite Plan | Monthly | Annual /month | Annual Total | Saving/year |
|---|---|---|---|---|
| **Suite Starter** | NPR 12,000 | NPR 9,000 | NPR 1,08,000 | NPR 36,000 |
| **Suite Growth** | NPR 22,000 | NPR 16,500 | NPR 1,98,000 | NPR 66,000 |
| **Suite Pro** | NPR 32,000 | NPR 24,000 | NPR 2,88,000 | NPR 96,000 |

Suite saving vs buying three modules separately:
- Suite Starter saves NPR 3,000/month
- Suite Growth saves NPR 2,000/month
- Suite Pro saves NPR 4,000/month

---

### Plan Feature Gates — Per Module

**Crest IMS**
| Feature | Starter | Growth | Pro |
|---|---|---|---|
| Item Master with unit conversion | ✓ | ✓ | ✓ |
| Vendor Management | ✓ | ✓ | ✓ |
| Purchases + Vendor Returns | ✓ | ✓ | ✓ |
| Stock Count (opening / closing / wastage) | ✓ | ✓ | ✓ |
| BS Calendar Periods | ✓ | ✓ | ✓ |
| Dashboard and KPI Overview | ✓ | ✓ | ✓ |
| Basic Reports | ✓ | ✓ | ✓ |
| Sales Entry | ✗ | ✓ | ✓ |
| Recipe Costing + live food cost % | ✗ | ✓ | ✓ |
| Sub-recipe support | ✗ | ✓ | ✓ |
| Variance Report | ✗ | ✓ | ✓ |
| Monthly Summary (COGS) | ✗ | ✓ | ✓ |
| Payment Summary (Cash / Credit / FonePay) | ✗ | ✓ | ✓ |
| Reorder Report and Par Levels | ✗ | ✓ | ✓ |
| Mobile Stock Count PWA (offline) | ✗ | ✓ | ✓ |
| Reorder Push Alerts | ✗ | ✓ | ✓ |
| Menu Engineering (Star / Puzzle / Dog) | ✗ | ✗ | ✓ |
| FIFO / Expiry Tracking | ✗ | ✗ | ✓ |
| Vendor Spend Report | ✗ | ✗ | ✓ |
| Supplier Price Tracker | ✗ | ✗ | ✓ |
| Overheads and True Margin Analysis | ✗ | ✗ | ✓ |
| Custom Branding and Settings | ✗ | ✗ | ✓ |
| Multi-property | ✗ | ✗ | ✓ |
| API Access | ✗ | ✗ | ✓ |

**Crest POS**
| Feature | Starter | Growth | Pro |
|---|---|---|---|
| Table Management and Floor Plan | ✓ | ✓ | ✓ |
| Order Taking with Modifiers | ✓ | ✓ | ✓ |
| KOT Printing | ✓ | ✓ | ✓ |
| Billing with VAT (13%) and Service Charge | ✓ | ✓ | ✓ |
| Cash Payment | ✓ | ✓ | ✓ |
| Basic Z-Report | ✓ | ✓ | ✓ |
| User Roles and PIN Auth | ✓ | ✓ | ✓ |
| QR Payments (eSewa / Khalti / FonePay / ConnectIPS) | ✗ | ✓ | ✓ |
| Card Payment Integration | ✗ | ✓ | ✓ |
| Bill Splitting (equal or item-based) | ✗ | ✓ | ✓ |
| Discount Controls with Manager PIN | ✗ | ✓ | ✓ |
| Void Management with Audit Log | ✗ | ✓ | ✓ |
| Offline Mode (IndexedDB + auto-sync) | ✗ | ✓ | ✓ |
| Happy Hour Pricing (auto time-based) | ✗ | ✓ | ✓ |
| Multiple Printer Routing | ✗ | ✓ | ✓ |
| Shift Management (X-report / Z-report) | ✗ | ✓ | ✓ |
| PWA Order Taking on Phone / Tablet | ✗ | ✓ | ✓ |
| Course Firing (fine dining) | ✗ | ✗ | ✓ |
| Reservation Integration (Crest OTA) | ✗ | ✗ | ✓ |
| Advanced Reports (waiter performance, hourly trend) | ✗ | ✗ | ✓ |
| Full Audit Trail | ✗ | ✗ | ✓ |
| Multi-property | ✗ | ✗ | ✓ |
| API Access | ✗ | ✗ | ✓ |

**Crest HR**
| Feature | Starter | Growth | Pro |
|---|---|---|---|
| Employee Master | ✓ | ✓ | ✓ |
| Leave Management (apply / approve / balance) | ✓ | ✓ | ✓ |
| Attendance (manual entry) | ✓ | ✓ | ✓ |
| Payslip Generation | ✓ | ✓ | ✓ |
| Employee PWA (own payslip / leave / shifts) | ✓ | ✓ | ✓ |
| SSF Computation (11% + 20%) | ✗ | ✓ | ✓ |
| Income Tax TDS (Nepal slab-based) | ✗ | ✓ | ✓ |
| Staff Rostering (weekly roster board) | ✗ | ✓ | ✓ |
| Shift Templates and Coverage Alerts | ✗ | ✓ | ✓ |
| Labour Act Compliance (rest day enforcement) | ✗ | ✓ | ✓ |
| OT Management (1.5x / 2x) | ✗ | ✓ | ✓ |
| Festival Allowance (Dashain) | ✗ | ✓ | ✓ |
| Staff Advances and Repayment Tracking | ✗ | ✓ | ✓ |
| Full Payroll Run | ✗ | ✓ | ✓ |
| Bank Transfer List | ✗ | ✓ | ✓ |
| SSF Monthly Challan | ✗ | ✓ | ✓ |
| Roster Publish + Push Notifications | ✗ | ✓ | ✓ |
| Shift Swap (employee requests, manager approves) | ✗ | ✓ | ✓ |
| Labour Cost Forecast on Roster | ✗ | ✓ | ✓ |
| Labour Cost Dashboard (% of revenue) | ✗ | ✗ | ✓ |
| TDS Annual Certificate | ✗ | ✗ | ✓ |
| SSF Annual Contribution Statement | ✗ | ✗ | ✓ |
| Full HR Compliance Reports Pack | ✗ | ✗ | ✓ |
| Biometric Integration | ✗ | ✗ | ✓ |
| Advanced HR Analytics | ✗ | ✗ | ✓ |
| Multi-property Rostering | ✗ | ✗ | ✓ |
| API Access | ✗ | ✗ | ✓ |

---

### Suite Plan Feature Summary

**Suite Starter — NPR 12,000/month**
- IMS Starter + POS Starter + HR Starter
- Core operations only — purchasing, stock, order taking, billing, employee management, leave, payslip
- Cash payments only
- No recipe costing, no variance, no SSF/TDS, no rostering, no QR payments
- No cross-module integration
- No owner dashboard
- Best for: very small cafés or businesses just getting started with systems

**Suite Growth — NPR 22,000/month**
- IMS Growth + POS Growth + HR Growth
- Everything in Starter plus:
- Recipe costing, variance, menu engineering foundation, mobile stock count PWA
- QR payments, bill splitting, discount/void controls, offline mode
- SSF, TDS, full payroll run, staff rostering, OT, festival allowance
- **Cross-module integration unlocked:**
  - POS sale → automatic IMS stock deduction via recipe linkage
  - POS shifts → HR attendance pre-fill
  - IMS staff meals → HR payroll deduction
  - Owner dashboard — food cost %, labour cost %, gross profit % live on phone
- Best for: established cafés and restaurants wanting full cost control and compliance

**Suite Pro — NPR 32,000/month**
- IMS Pro + POS Pro + HR Pro
- Everything in Growth plus:
- Menu engineering (Star / Puzzle / Dog), FIFO tracking, vendor spend and price tracker, true margin analysis
- Course firing, reservation integration, advanced POS reports, full audit trail
- Labour cost dashboard, TDS/SSF annual certificates, biometric integration, full compliance pack
- **Multi-property unlocked** — one login, multiple branches, consolidated owner dashboard
- Cross-property staff rostering
- API access for all three modules
- Custom branding and settings
- Best for: hotel F&B, multi-branch operations, high-volume establishments

---

## 6. DATABASE SCHEMA STRUCTURE

### Schema Separation Convention
All tables prefixed by module to avoid naming conflicts:

```
shared_*    — clients, users, roles, properties (all modules read/write)
ims_*       — IMS-specific tables
pos_*       — POS-specific tables
hr_*        — HR-specific tables
```

### Shared Tables (All Modules)
```sql
shared_clients          -- the business using Crest Suite
shared_properties       -- physical locations (one client, multiple branches)
shared_users            -- all users across all modules
shared_roles            -- owner, manager, supervisor, staff, cashier, kitchen
shared_user_roles       -- which user has which role at which property
```

### IMS Tables
```sql
ims_item_master
ims_item_categories
ims_vendors
ims_purchases
ims_purchase_items
ims_stock_counts
ims_stock_count_items
ims_recipes
ims_recipe_ingredients
ims_sales_entries
ims_sale_items
ims_periods              -- BS month periods (Baisakh, Jestha etc.)
ims_variance_reports
ims_vendor_returns
ims_staff_meals          -- consumed by HR for payroll deductions
ims_reorder_alerts
```

### POS Tables
```sql
pos_tables
pos_table_sections       -- indoor, outdoor, bar, rooftop
pos_menu_items
pos_menu_categories
pos_modifiers
pos_modifier_groups
pos_orders
pos_order_items
pos_order_item_modifiers
pos_kot_tickets
pos_bills
pos_bill_items
pos_payments
pos_shifts               -- read by HR for attendance
pos_shift_sessions       -- individual staff shift open/close
pos_void_logs
pos_discount_logs
pos_reservations
```

### HR Tables
```sql
hr_employees
hr_salary_structures
hr_salary_components
hr_leave_types
hr_leave_applications
hr_leave_balances
hr_attendance
hr_rosters
hr_roster_shifts
hr_shift_templates       -- Morning, Afternoon, Evening, Split, Full Day
hr_overtime_entries
hr_payroll_runs
hr_payslips
hr_payslip_items
hr_ssf_challans
hr_tds_entries
hr_advances
hr_advance_repayments
hr_festival_allowances
hr_service_charge_dist   -- service charge distribution from POS
```

---

## 7. MODULE INTEGRATIONS — HOW DATA FLOWS

### POS → IMS (Sale triggers stock deduction)
```
POS confirms bill
  → Writes to: pos_bills, pos_bill_items
  → Supabase trigger fires
  → Reads recipe from: ims_recipes, ims_recipe_ingredients
  → Deducts from: ims_stock_counts (current period)
  → Updates: ims_variance_reports
```
Method: Supabase database trigger — zero latency, no API call
Unlocked on: Suite Growth and above

### POS → HR (Shift data feeds attendance)
```
POS cashier opens shift → writes to pos_shift_sessions
  → HR reads pos_shift_sessions for that employee
  → Pre-fills attendance record (employee was present)
  → Manager confirms or adjusts in HR attendance module
```
Unlocked on: Suite Growth and above

### IMS → HR (Staff meal deduction)
```
Manager logs staff meal in IMS → writes to ims_staff_meals
  → Monthly payroll run reads ims_staff_meals
  → Deducts total from employee net salary automatically
```
Unlocked on: Suite Growth and above

### HR → Owner Dashboard (Labour cost)
```
HR payroll run approved
  → Total labour cost written to hr_monthly_summary
  → Dashboard reads hr_monthly_summary + pos_monthly_summary + ims_monthly_summary
  → Displays: food cost %, labour cost %, gross profit % — all live
```
Unlocked on: Suite Growth and above

### POS → HR (Waiter performance)
```
pos_bills has waiter_user_id on every record
  → HR performance report queries pos_bills grouped by waiter_user_id
  → Revenue per waiter, ATV, covers served — auto-generated
  → Feeds HR performance review module
```
Unlocked on: Suite Pro

---

## 8. USER ROLES AND ACCESS

### Roles (stored in shared_roles)
| Role | Code | Access Level |
|---|---|---|
| Owner | owner | Full access to all enabled modules |
| Manager | manager | All operational functions, all reports |
| Supervisor | supervisor | Department-level — own team only |
| Staff / Waiter | staff | Order taking, own attendance, own payslip |
| Cashier | cashier | Payment processing, shift management |
| Kitchen | kitchen | KOT view only (future KDS module) |

### Authentication
- **Login:** Email + password via Supabase Auth
- **Floor Use:** 4-digit PIN per staff member (faster during service)
- **Manager Override PIN:** Separate PIN for approving voids, discounts, refunds
- **Session Timeout:** Auto-lock after 2 minutes inactivity

### Role Access Matrix — IMS
| Feature | Owner | Manager | Supervisor | Staff |
|---|---|---|---|---|
| Item Master | Full | Full | View | No |
| Vendors | Full | Full | No | No |
| Purchases | Full | Full | View | No |
| Stock Count | Full | Full | Own dept | Enter only |
| Recipes | Full | Full | View | No |
| Reports | Full | Full | No | No |

### Role Access Matrix — POS
| Feature | Owner | Manager | Supervisor | Cashier | Staff |
|---|---|---|---|---|---|
| Floor plan | View | Full | Full | Full | Full |
| Order taking | No | Full | Full | No | Full |
| Bill generation | No | Full | Full | Full | Request only |
| Void (after send) | Approve | Approve | No | No | No |
| Discounts above threshold | Approve | Approve | No | No | No |
| Shift open/close | No | Yes | No | Yes | No |
| Reports | Full | Full | No | Own shift | No |

### Role Access Matrix — HR
| Feature | Owner | Manager | Supervisor | Staff |
|---|---|---|---|---|
| Employee Master (all) | Full | Full | Own dept | Own profile |
| Salary structures | Full | Full | No | Own only |
| Payroll run | Approve | Prepare | No | No |
| Payslip | All staff | All staff | No | Own only |
| Leave approve | Yes | Yes | Own team | No |
| Roster build | No | Yes | Draft own dept | No |
| Roster view | All | All | Own dept | Own shifts |
| OT approve | Yes | Yes | No | No |
| SSF / TDS | Yes | Yes | No | No |

---

## 9. PWA ARCHITECTURE

### Service Worker Caching Strategy
| Data Type | Strategy | Reason |
|---|---|---|
| React app shell | Cache first | Never changes between sessions |
| Item Master / Menu | Cache + background sync | Needed offline for stock count / orders |
| Supabase API calls | Network first, fallback cache | Always want fresh data if possible |
| Offline transactions | IndexedDB queue | Core offline use case |

### Offline Queue (IndexedDB)
```javascript
{
  id: "local_001",
  type: "stock_count_entry",
  period_id: "83-baisakh",
  item_id: "uuid",
  item_name: "Oat Milk",
  physical_count: 3.5,
  unit: "litre",
  entered_by: "user_uuid",
  entered_at: "2026-06-18T10:30:00",
  synced: false
}
// On reconnection: service worker fires background sync
// All synced: false records push to Supabase, marked synced: true
```

### PWA Features by Role
| Role | PWA Use Cases |
|---|---|
| Owner | Financial dashboard, payroll approval, labour cost %, food cost % |
| Manager | Roster build and publish, leave approvals, OT approval, stock alerts |
| Supervisor | Department roster, team leave approvals, attendance entry |
| Chef | Flag low stock, upload new recipes, view production list |
| Purchase Manager | Reorder alerts, raise POs, approve deliveries |
| Waiter / FOH | Order taking on tablet, table status, own shifts |
| Cashier | Payment processing, shift open/close |
| Employee | Own payslip, leave application, own shifts, own attendance |

### Install Experience
- **Android (Chrome):** Auto-install banner after 30 seconds
- **iOS (Safari):** Share → Add to Home Screen (manual, one-time)
- No App Store required — installs directly from browser
- Future: Capacitor wrapping for App Store submission if needed

---

## 10. CREST IMS — CURRENT STATE (PILOT LIVE)

### Live Modules
- Item Master (with categories and units)
- Vendor Management
- Purchase Entry with FIFO cost tracking
- Stock Count (physical count per period)
- Recipe Costing (with sub-recipe support)
- Sales Entry (manual — will be replaced by POS integration)
- Variance Report (theoretical vs actual stock)
- Monthly Summary Report
- Payment Summary (vendor payments)
- Vendor Returns

### Pilot Client
- **Casa Acai Café**, Kathmandu
- Data from Jestha 2083 active
- Key finding: ~NPR 97,617 data entry error inflating closing stock
- Corrected food cost: ~61% vs as-reported ~41%
- Dead stock identified: Bacon, Salami, Prawns
- Loss-making items: Orange Juice, Peri Peri Wings, Cold Brew

### Reporting Style
- Professional Garamond-styled A4 .docx documents
- Cover page, color-coded tables, page numbers
- Crest Hospitality branding — navy (#1B2A4A) and gold (#C9A84C)
- All reports marked Confidential
- Currency: NPR, Dates: BS calendar

### Pending IMS Features
- Stock Register Report (running balance)
- Reorder alert system (PWA push notifications)
- Mobile stock count (PWA offline-first)
- POS integration (auto-deduction on sale)
- Menu Engineering (Star / Puzzle / Dog) — Pro plan
- FIFO / Expiry Tracking — Pro plan
- Vendor Spend Report + Supplier Price Tracker — Pro plan

---

## 11. CREST POS — FEATURE SPECIFICATION SUMMARY

### Core Modules to Build
1. **Table Management** — Floor plan, cover count, merge, transfer, reservations
2. **Order Management** — Menu display, search, modifiers, item notes, course firing, held orders
3. **KOT** — Auto-generation, multi-printer routing, reprint, void KOT
4. **Billing** — Preview, splitting, discounts, complimentary, service charge, VAT (13%)
5. **Payment Processing** — Cash, card, QR (eSewa/Khalti/FonePay/ConnectIPS), house account, split modes
6. **Void and Refund** — Item void, bill void, post-payment refund, void reason codes
7. **Shift Management** — Opening float, X-report, Z-report, multiple shifts per day
8. **Menu Management** — IMS recipe linkage, price levels, 86 management, daily specials, happy hour
9. **Reporting** — Daily sales, hourly trend, item sales, void/discount, waiter performance, payment mode
10. **User Management** — Role hierarchy, PIN auth, manager override PIN, session timeout
11. **Hardware** — ESC/POS thermal printers, cash drawer, card terminal, all via WiFi
12. **Offline Mode** — IndexedDB queue, auto-sync, conflict resolution
13. **Crest Suite Integration** — IMS stock deduction, HR attendance, owner dashboard

### Critical Integration Point
```
POS sale confirmed
  → Supabase trigger reads linked recipe
  → Deducts ingredients from IMS current period stock
  → Food cost % updates in real time on owner dashboard
```
Unlocked on Suite Growth and above.

### Build Priority Sequence
1. Table Management + Order Taking (3–4 weeks)
2. KOT Printing (1–2 weeks)
3. Billing + VAT + Payment Modes (2–3 weeks)
4. Shift Management + Z-Report (1–2 weeks)
5. Crest IMS Integration (2–3 weeks)
6. Void and Discount Controls (1 week)
7. Offline Mode (2 weeks)
8. Reporting Suite (2 weeks)
9. User Roles and PIN Auth (1 week)
10. Hardware Integration (1–2 weeks)

---

## 12. CREST HR — FEATURE SPECIFICATION SUMMARY

### Core Modules to Build
1. **Employee Master** — Personal info, employment records, document tracking, bank/SSF/PAN details
2. **Leave Management** — Nepal Labour Act leave types, application flow, balance tracking, encashment
3. **Attendance Management** — Daily status codes, entry methods, monthly reconciliation
4. **Staff Rostering** — Weekly roster board, shift templates, coverage alerts, Labour Act compliance
5. **Overtime Management** — Three OT sources, Nepal rates (1.5x weekday, 2x holiday), approval flow
6. **Salary Structure** — Component-wise configuration, service charge distribution, revision history
7. **SSF Computation** — Employee 11% + Employer 20% of basic, monthly challan, annual report
8. **Income Tax TDS** — Nepal slab-based, female rebate, monthly computation, TDS certificate
9. **Payroll Processing** — Full net salary formula, payroll run workflow, payslip, bank list
10. **Festival Allowance** — Dashain computation, pro-rata for new joiners, advance tracking
11. **Staff Advances** — Advance register, automatic repayment deduction
12. **HR Reports** — Operational and annual compliance reports

### Nepal Labour Act Compliance (CRITICAL)
- Minimum 1 rest day per 7-day working period (enforced in roster)
- OT rate: 1.5x on working days, 2x on rest/public holidays
- Festival allowance: 1 month basic salary (pro-rata if < 1 year service)
- Maternity leave: 98 days paid
- Annual leave: 18 days per year (1.5 days/month)
- Sick leave: 12 days per year
- Casual leave: 6 days per year

### SSF Computation
```
Employee SSF = Basic Salary × 11%    (deducted from gross)
Employer SSF = Basic Salary × 20%    (additional employer cost)
Total SSF    = Basic Salary × 31%
```

### Nepal Income Tax Slabs (FY 2082/83)
```
Up to NPR 5,00,000        →  1%
NPR 5,00,001–7,00,000     → 10%
NPR 7,00,001–10,00,000    → 20%
NPR 10,00,001–20,00,000   → 30%
Above NPR 20,00,000       → 36%
Female employee rebate: 10% on computed tax
```

### Net Salary Formula
```
Gross Salary
+ Overtime Amount
+ Service Charge Share
+ Festival Allowance (Dashain month only)
+ Leave Encashment (fiscal year end month only)
─────────────────────────────────
Total Earnings
- SSF Employee Contribution (11% of Basic)
- Income Tax TDS (slab-based)
- Staff Meal Deduction (from Crest IMS)
- Advance / Loan Repayment
- Absence Deduction (unpaid days × daily rate)
─────────────────────────────────
= NET PAYABLE SALARY
```

### Staff Rostering — Key Features
- Weekly grid: employees (rows) × days (columns) × shift blocks (cells)
- Shift templates: Morning, Afternoon, Evening, Full Day, Split, Night — colour-coded
- Minimum coverage alerts per shift per department (configurable)
- Labour Act rest day compliance — flags 7 consecutive working days
- OT warning — flags when shifts exceed weekly hour threshold
- Leave integration — approved leave auto-blocks roster assignment
- Availability preferences — employee submits via PWA (advisory only)
- Copy previous week — duplicates last week's roster as starting template
- Publish and notify — push notification to all affected employees on publish
- Shift swap — employee requests, colleague accepts, manager approves
- Attendance reconciliation — actual vs rostered feeds payroll
- Labour cost forecast — estimated weekly cost + labour cost % of revenue

### Build Priority Sequence
1. Employee Master (1–2 weeks)
2. Salary Structure (1 week)
3. Leave Management (1–2 weeks)
4. Staff Rostering (3–4 weeks) — highest adoption value
5. Attendance Management (1–2 weeks)
6. OT Management (1 week)
7. SSF Computation (1 week)
8. Income Tax TDS (1 week)
9. Payroll Processing (2–3 weeks)
10. Festival Allowance (1 week)
11. Staff Advances (1 week)
12. HR Reports (1–2 weeks)

---

## 13. PROJECT STRUCTURE

### Single Repository (Recommended)
```
crest-suite/
├── public/
│   ├── manifest.json          ← PWA manifest
│   └── service-worker.js      ← offline caching + background sync
├── src/
│   ├── modules/
│   │   ├── ims/
│   │   │   ├── items/
│   │   │   ├── vendors/
│   │   │   ├── purchases/
│   │   │   ├── stockcount/
│   │   │   ├── recipes/
│   │   │   ├── sales/
│   │   │   ├── variance/
│   │   │   └── reports/
│   │   ├── pos/
│   │   │   ├── tables/
│   │   │   ├── orders/
│   │   │   ├── kot/
│   │   │   ├── billing/
│   │   │   ├── payments/
│   │   │   ├── shifts/
│   │   │   ├── menu/
│   │   │   └── reports/
│   │   └── hr/
│   │       ├── employees/
│   │       ├── leave/
│   │       ├── attendance/
│   │       ├── roster/
│   │       ├── overtime/
│   │       ├── salary/
│   │       ├── ssf/
│   │       ├── tds/
│   │       ├── payroll/
│   │       ├── festival/
│   │       ├── advances/
│   │       └── reports/
│   ├── shared/
│   │   ├── components/        ← reusable UI components
│   │   ├── hooks/             ← useClientFeatures, useAuth, useBS etc.
│   │   ├── context/           ← AuthContext, ClientContext, FeatureContext
│   │   ├── utils/             ← BS/AD converters, currency formatters
│   │   └── constants/         ← leave types, shift types, tax slabs, SSF rates
│   ├── dashboard/             ← owner dashboard (cross-module summary)
│   ├── auth/                  ← login, PIN entry, role routing
│   └── App.jsx                ← top-level routing with feature flag gates
├── supabase/
│   └── migrations/
├── .env.local
└── package.json
```

### Key Hooks
```javascript
// useClientFeatures — foundation of all feature gating
const useClientFeatures = () => {
  const { client } = useAuth();
  return {
    ims_enabled: client.ims_enabled,
    ims_plan: client.ims_plan,         // "starter" | "growth" | "pro"
    pos_enabled: client.pos_enabled,
    pos_plan: client.pos_plan,
    hr_enabled: client.hr_enabled,
    hr_plan: client.hr_plan,
  };
};

// useBS — Bikram Sambat date utilities
const useBS = () => ({
  toBS: (adDate) => { /* convert AD to BS */ },
  toAD: (bsDate) => { /* convert BS to AD */ },
  currentBSMonth: () => { /* current BS month name and year */ },
  bsMonths: ["Baisakh","Jestha","Ashadh","Shrawan","Bhadra","Ashwin",
             "Kartik","Mangsir","Poush","Magh","Falgun","Chaitra"]
});
```

### Environment Variables
```
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_VERSION=1.0.0
REACT_APP_ENV=production
```

---

## 14. BRANDING AND DESIGN

| Element | Value |
|---|---|
| Primary colour | Navy — #1B2A4A |
| Accent colour | Gold — #C9A84C |
| Light gold | #F5EDD6 |
| Light grey | #F2F2F2 |
| Font (documents) | Garamond |
| Font (UI) | System font |
| Document style | A4, Garamond, navy/gold, professional |
| Report style | Cover page, colour-coded tables, confidential footer |

---

## 15. DEPLOYMENT

| Environment | URL | Platform |
|---|---|---|
| Production | app.cresthospitality.com | Vercel |
| Staging | staging.cresthospitality.com | Vercel |
| Database | Supabase (single project) | Supabase Cloud |

---

## 16. WHAT NOT TO BUILD YET

The following are planned future Crest divisions — do not build these now:
- Crest ATS (Applicant Tracking)
- Crest Academy (Training Platform)
- Crest Analytics (Industry Data)
- Crest Warehouse (B2B Supply)
- Crest Caterer (Lunchbox and Events)
- Crest Transport (Vehicle Hire)
- Crest OTA (Online Travel Agency)
- Crest DM (Digital Marketing)
- Crest Finance (Capital Facilitation)

**Current focus:** Crest IMS (enhance) + Crest POS (build) + Crest HR (build) — one codebase.

---

## 17. GLOSSARY

| Term | Meaning |
|---|---|
| BS | Bikram Sambat — Nepal's official calendar |
| AD | Anno Domini — Gregorian calendar |
| NPR | Nepalese Rupee |
| VAT | Value Added Tax — 13% in Nepal |
| SSF | Social Security Fund — Nepal |
| TDS | Tax Deducted at Source |
| IRD | Inland Revenue Department — Nepal's tax authority |
| BOH | Back of House — kitchen, stores, prep areas |
| FOH | Front of House — dining room, bar, reception |
| KOT | Kitchen Order Ticket |
| FIFO | First In First Out — stock cost methodology |
| COGS | Cost of Goods Sold |
| ATV | Average Transaction Value |
| OT | Overtime |
| PO | Purchase Order |
| RLS | Row Level Security (Supabase) |
| PWA | Progressive Web App |
| ESC/POS | Printer protocol standard for thermal printers |
| IMS | Inventory Management System |
| POS | Point of Sale |
| HR | Human Resources |
| CaaS | Controls as a Service (consulting retainer) |
| NPABSON | Nepal Private and Boarding Schools Organisation of Nepal |

---

*Crest Hospitality (Pvt. Ltd.) | Kathmandu, Nepal | Confidential | June 2026*
