-- ============================================================
-- CREST HOSPITALITY — INVENTORY MANAGEMENT SYSTEM
-- Supabase Schema v1.0
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ─────────────────────────────────────────
-- 1. CLIENTS
-- ─────────────────────────────────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  contact_person text,
  contact_phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- 2. USER PROFILES (links Supabase auth users to clients)
-- ─────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  client_id uuid references clients(id),
  full_name text,
  role text check (role in ('admin', 'client')) default 'client',
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─────────────────────────────────────────
-- 3. CATEGORIES
-- ─────────────────────────────────────────
create table categories (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- 4. VENDORS
-- ─────────────────────────────────────────
create table vendors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  name text not null,
  contact_person text,
  phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- 5. ITEMS (ingredient master)
-- ─────────────────────────────────────────
create table items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  category_id uuid references categories(id),
  name text not null,
  uom text not null,           -- base unit: GM, ML, PCS, PKT, etc.
  purchase_qty numeric not null, -- qty per purchase pack
  rate numeric not null,        -- price per pack
  per_uom_rate numeric generated always as (rate / nullif(purchase_qty, 0)) stored,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- 6. MONTHLY PERIODS (one per client per BS month)
-- ─────────────────────────────────────────
create table monthly_periods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  bs_year int not null,
  bs_month int not null check (bs_month between 1 and 12),
  status text check (status in ('open', 'closed')) default 'open',
  created_at timestamptz default now(),
  unique(client_id, bs_year, bs_month)
);

-- ─────────────────────────────────────────
-- 7. OPENING STOCK (set at start of each period)
-- ─────────────────────────────────────────
create table opening_stock (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references monthly_periods(id) on delete cascade not null,
  item_id uuid references items(id) not null,
  qty numeric not null default 0,
  created_at timestamptz default now(),
  unique(period_id, item_id)
);

-- ─────────────────────────────────────────
-- 8. PURCHASE ENTRIES (daily, vendor-linked)
-- ─────────────────────────────────────────
create table purchase_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references monthly_periods(id) on delete cascade not null,
  item_id uuid references items(id) not null,
  vendor_id uuid references vendors(id),
  bs_day int not null check (bs_day between 1 and 32),
  qty numeric not null,
  rate numeric not null,        -- actual rate on this purchase (may differ from master)
  invoice_ref text,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- 9. CLOSING STOCK (physical count at month end)
-- ─────────────────────────────────────────
create table closing_stock (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references monthly_periods(id) on delete cascade not null,
  item_id uuid references items(id) not null,
  physical_qty numeric not null default 0,
  counted_by text,
  counted_at timestamptz default now(),
  unique(period_id, item_id)
);

-- ─────────────────────────────────────────
-- 10. WASTAGES
-- ─────────────────────────────────────────
create table wastages (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references monthly_periods(id) on delete cascade not null,
  item_id uuid references items(id) not null,
  bs_day int,
  qty numeric not null default 0,
  reason text,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- 11. RECIPES
-- ─────────────────────────────────────────
create table recipes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  name text not null,
  category text,                -- Food / Beverage / etc.
  selling_price numeric,
  vat_rate numeric default 0.13,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- 12. RECIPE INGREDIENTS
-- ─────────────────────────────────────────
create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references recipes(id) on delete cascade not null,
  item_id uuid references items(id) not null,
  qty_per_portion numeric not null,  -- in item's UOM
  created_at timestamptz default now(),
  unique(recipe_id, item_id)
);

-- ─────────────────────────────────────────
-- 13. SALES ENTRIES (daily sales qty per recipe)
-- ─────────────────────────────────────────
create table sales_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references monthly_periods(id) on delete cascade not null,
  recipe_id uuid references recipes(id) not null,
  bs_day int not null check (bs_day between 1 and 32),
  qty_sold numeric not null default 0,
  created_at timestamptz default now(),
  unique(period_id, recipe_id, bs_day)
);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────

alter table clients enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table vendors enable row level security;
alter table items enable row level security;
alter table monthly_periods enable row level security;
alter table opening_stock enable row level security;
alter table purchase_entries enable row level security;
alter table closing_stock enable row level security;
alter table wastages enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table sales_entries enable row level security;

-- Helper: get current user's client_id
create or replace function my_client_id()
returns uuid as $$
  select client_id from profiles where id = auth.uid()
$$ language sql security definer stable;

-- Helper: is current user admin?
create or replace function is_admin()
returns boolean as $$
  select role = 'admin' from profiles where id = auth.uid()
$$ language sql security definer stable;

-- CLIENTS: admin sees all, client sees own
create policy "clients_select" on clients for select
  using (is_admin() or id = my_client_id());

-- PROFILES: own profile only
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_admin());
create policy "profiles_update" on profiles for update
  using (id = auth.uid());

-- CATEGORIES
create policy "categories_select" on categories for select
  using (is_admin() or client_id = my_client_id());
create policy "categories_insert" on categories for insert
  with check (is_admin() or client_id = my_client_id());
create policy "categories_update" on categories for update
  using (is_admin() or client_id = my_client_id());
create policy "categories_delete" on categories for delete
  using (is_admin() or client_id = my_client_id());

-- VENDORS
create policy "vendors_select" on vendors for select
  using (is_admin() or client_id = my_client_id());
create policy "vendors_insert" on vendors for insert
  with check (is_admin() or client_id = my_client_id());
create policy "vendors_update" on vendors for update
  using (is_admin() or client_id = my_client_id());
create policy "vendors_delete" on vendors for delete
  using (is_admin() or client_id = my_client_id());

-- ITEMS
create policy "items_select" on items for select
  using (is_admin() or client_id = my_client_id());
create policy "items_insert" on items for insert
  with check (is_admin() or client_id = my_client_id());
create policy "items_update" on items for update
  using (is_admin() or client_id = my_client_id());
create policy "items_delete" on items for delete
  using (is_admin() or client_id = my_client_id());

-- MONTHLY PERIODS
create policy "periods_select" on monthly_periods for select
  using (is_admin() or client_id = my_client_id());
create policy "periods_insert" on monthly_periods for insert
  with check (is_admin() or client_id = my_client_id());
create policy "periods_update" on monthly_periods for update
  using (is_admin() or client_id = my_client_id());

-- OPENING STOCK (via period)
create policy "opening_select" on opening_stock for select
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "opening_insert" on opening_stock for insert
  with check (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "opening_update" on opening_stock for update
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());

-- PURCHASE ENTRIES
create policy "purchases_select" on purchase_entries for select
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "purchases_insert" on purchase_entries for insert
  with check (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "purchases_update" on purchase_entries for update
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "purchases_delete" on purchase_entries for delete
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());

-- CLOSING STOCK
create policy "closing_select" on closing_stock for select
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "closing_insert" on closing_stock for insert
  with check (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "closing_update" on closing_stock for update
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());

-- WASTAGES
create policy "wastages_select" on wastages for select
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "wastages_insert" on wastages for insert
  with check (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "wastages_update" on wastages for update
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "wastages_delete" on wastages for delete
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());

-- RECIPES
create policy "recipes_select" on recipes for select
  using (is_admin() or client_id = my_client_id());
create policy "recipes_insert" on recipes for insert
  with check (is_admin() or client_id = my_client_id());
create policy "recipes_update" on recipes for update
  using (is_admin() or client_id = my_client_id());
create policy "recipes_delete" on recipes for delete
  using (is_admin() or client_id = my_client_id());

-- RECIPE INGREDIENTS (via recipe)
create policy "recipe_ing_select" on recipe_ingredients for select
  using (is_admin() or (select client_id from recipes where id = recipe_id) = my_client_id());
create policy "recipe_ing_insert" on recipe_ingredients for insert
  with check (is_admin() or (select client_id from recipes where id = recipe_id) = my_client_id());
create policy "recipe_ing_update" on recipe_ingredients for update
  using (is_admin() or (select client_id from recipes where id = recipe_id) = my_client_id());
create policy "recipe_ing_delete" on recipe_ingredients for delete
  using (is_admin() or (select client_id from recipes where id = recipe_id) = my_client_id());

-- SALES ENTRIES
create policy "sales_select" on sales_entries for select
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "sales_insert" on sales_entries for insert
  with check (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "sales_update" on sales_entries for update
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());
create policy "sales_delete" on sales_entries for delete
  using (is_admin() or (select client_id from monthly_periods where id = period_id) = my_client_id());

