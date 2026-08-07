-- =============================================================================
-- SUPA AI — 0010_phase8_business.sql
-- Phase 10: Business AI Suite — CRM, invoicing, inventory, accounting,
-- projects, calendar, and an AI assistant that answers business questions.
--
-- 18 workspace-scoped tables, all with default-deny RLS backed by the
-- `is_workspace_member(ws_id, user_id)` SECURITY DEFINER function from
-- migration 0009_phase7_workspace.sql. Money is stored as numeric(14,2)
-- (multi-currency business suite — integer cents would force a single
-- currency). Timestamps are timestamptz. updated_at maintained by the
-- shared `public.set_updated_at()` trigger from migration 0003.
--
-- Design principles (carried from 0001 + 0009):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. No `USING (true)` open policies.
--   • Every table has `workspace_id NOT NULL` referencing `public.workspaces`
--     with `on delete cascade`.
--   • Indexes on `(workspace_id, created_at desc)` + `(workspace_id, status)`
--     + a GIN FTS index where free-text search is supported.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. customers — organizations / individuals a workspace sells to.
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  email         text,
  phone         text,
  company       text,
  status        text not null default 'active'
                  check (status in ('active','inactive','lead','archived','blacklisted')),
  customer_type text not null default 'individual'
                  check (customer_type in ('individual','business','enterprise','government','nonprofit')),
  tags          text[] not null default '{}',
  avatar_url    text,
  address       jsonb,
  metadata      jsonb,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.customers enable row level security;
create index if not exists customers_workspace_idx on public.customers (workspace_id, created_at desc);
create index if not exists customers_status_idx on public.customers (workspace_id, status);
create index if not exists customers_email_idx on public.customers (workspace_id, email);
create index if not exists customers_name_fts_idx on public.customers using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(company,'') || ' ' || coalesce(email,'')));
drop policy if exists "customers_ws_select" on public.customers;
create policy "customers_ws_select" on public.customers for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "customers_ws_insert" on public.customers;
create policy "customers_ws_insert" on public.customers for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "customers_ws_update" on public.customers;
create policy "customers_ws_update" on public.customers for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "customers_ws_delete" on public.customers;
create policy "customers_ws_delete" on public.customers for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. contacts — people inside a customer organization.
-- -----------------------------------------------------------------------------
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete cascade,
  first_name    text not null,
  last_name     text,
  email         text,
  phone         text,
  title          text,
  department    text,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.contacts enable row level security;
create index if not exists contacts_workspace_idx on public.contacts (workspace_id, created_at desc);
create index if not exists contacts_customer_idx on public.contacts (workspace_id, customer_id);
drop policy if exists "contacts_ws_select" on public.contacts;
create policy "contacts_ws_select" on public.contacts for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "contacts_ws_insert" on public.contacts;
create policy "contacts_ws_insert" on public.contacts for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "contacts_ws_update" on public.contacts;
create policy "contacts_ws_update" on public.contacts for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "contacts_ws_delete" on public.contacts;
create policy "contacts_ws_delete" on public.contacts for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. leads — qualified prospects not yet converted to customers.
-- -----------------------------------------------------------------------------
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  email         text,
  phone         text,
  company       text,
  source        text not null default 'manual'
                  check (source in ('manual','website','referral','cold-outreach','event','ad','api','other')),
  status        text not null default 'new'
                  check (status in ('new','contacted','qualified','proposal','negotiation','won','lost')),
  score         integer not null default 0 check (score >= 0 and score <= 100),
  assigned_to   uuid references auth.users (id) on delete set null,
  converted_to_customer_id uuid references public.customers (id) on delete set null,
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.leads enable row level security;
create index if not exists leads_workspace_idx on public.leads (workspace_id, created_at desc);
create index if not exists leads_status_idx on public.leads (workspace_id, status);
create index if not exists leads_assigned_idx on public.leads (workspace_id, assigned_to);
drop policy if exists "leads_ws_select" on public.leads;
create policy "leads_ws_select" on public.leads for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "leads_ws_insert" on public.leads;
create policy "leads_ws_insert" on public.leads for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "leads_ws_update" on public.leads;
create policy "leads_ws_update" on public.leads for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "leads_ws_delete" on public.leads;
create policy "leads_ws_delete" on public.leads for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 4. opportunities — pipeline deals tied to a customer / lead.
-- -----------------------------------------------------------------------------
create table if not exists public.opportunities (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete set null,
  lead_id       uuid references public.leads (id) on delete set null,
  name          text not null,
  amount        numeric(14,2) not null default 0 check (amount >= 0),
  stage         text not null default 'prospecting'
                  check (stage in ('prospecting','qualification','needs-analysis','proposal','negotiation','closed-won','closed-lost')),
  probability   integer not null default 0 check (probability >= 0 and probability <= 100),
  expected_close_date date,
  assigned_to   uuid references auth.users (id) on delete set null,
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.opportunities enable row level security;
create index if not exists opportunities_workspace_idx on public.opportunities (workspace_id, created_at desc);
create index if not exists opportunities_stage_idx on public.opportunities (workspace_id, stage);
create index if not exists opportunities_customer_idx on public.opportunities (workspace_id, customer_id);
drop policy if exists "opportunities_ws_select" on public.opportunities;
create policy "opportunities_ws_select" on public.opportunities for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "opportunities_ws_insert" on public.opportunities;
create policy "opportunities_ws_insert" on public.opportunities for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "opportunities_ws_update" on public.opportunities;
create policy "opportunities_ws_update" on public.opportunities for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "opportunities_ws_delete" on public.opportunities;
create policy "opportunities_ws_delete" on public.opportunities for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. invoices — bills issued to customers.
-- -----------------------------------------------------------------------------
create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete set null,
  number        text not null,
  status        text not null default 'draft'
                  check (status in ('draft','sent','viewed','partial','paid','overdue','void','cancelled')),
  issue_date    date not null default current_date,
  due_date      date,
  subtotal      numeric(14,2) not null default 0 check (subtotal >= 0),
  tax           numeric(14,2) not null default 0 check (tax >= 0),
  discount      numeric(14,2) not null default 0 check (discount >= 0),
  total         numeric(14,2) not null default 0 check (total >= 0),
  currency      text not null default 'USD',
  notes         text,
  items         jsonb not null default '[]',
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, number)
);
alter table public.invoices enable row level security;
create index if not exists invoices_workspace_idx on public.invoices (workspace_id, created_at desc);
create index if not exists invoices_status_idx on public.invoices (workspace_id, status);
create index if not exists invoices_customer_idx on public.invoices (workspace_id, customer_id);
drop policy if exists "invoices_ws_select" on public.invoices;
create policy "invoices_ws_select" on public.invoices for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "invoices_ws_insert" on public.invoices;
create policy "invoices_ws_insert" on public.invoices for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "invoices_ws_update" on public.invoices;
create policy "invoices_ws_update" on public.invoices for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "invoices_ws_delete" on public.invoices;
create policy "invoices_ws_delete" on public.invoices for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 6. quotations — price quotes (pre-invoice).
-- -----------------------------------------------------------------------------
create table if not exists public.quotations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete set null,
  number        text not null,
  status        text not null default 'draft'
                  check (status in ('draft','sent','viewed','accepted','rejected','expired','cancelled')),
  valid_until   date,
  subtotal      numeric(14,2) not null default 0 check (subtotal >= 0),
  tax           numeric(14,2) not null default 0 check (tax >= 0),
  discount      numeric(14,2) not null default 0 check (discount >= 0),
  total         numeric(14,2) not null default 0 check (total >= 0),
  currency      text not null default 'USD',
  items         jsonb not null default '[]',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, number)
);
alter table public.quotations enable row level security;
create index if not exists quotations_workspace_idx on public.quotations (workspace_id, created_at desc);
create index if not exists quotations_status_idx on public.quotations (workspace_id, status);
drop policy if exists "quotations_ws_select" on public.quotations;
create policy "quotations_ws_select" on public.quotations for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "quotations_ws_insert" on public.quotations;
create policy "quotations_ws_insert" on public.quotations for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "quotations_ws_update" on public.quotations;
create policy "quotations_ws_update" on public.quotations for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "quotations_ws_delete" on public.quotations;
create policy "quotations_ws_delete" on public.quotations for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 7. proposals — long-form sales documents sent to customers.
-- -----------------------------------------------------------------------------
create table if not exists public.proposals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete set null,
  title         text not null,
  content       text,
  status        text not null default 'draft'
                  check (status in ('draft','sent','viewed','accepted','rejected','expired','archived')),
  sent_at       timestamptz,
  accepted_at   timestamptz,
  expired_at    timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.proposals enable row level security;
create index if not exists proposals_workspace_idx on public.proposals (workspace_id, created_at desc);
create index if not exists proposals_status_idx on public.proposals (workspace_id, status);
drop policy if exists "proposals_ws_select" on public.proposals;
create policy "proposals_ws_select" on public.proposals for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "proposals_ws_insert" on public.proposals;
create policy "proposals_ws_insert" on public.proposals for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "proposals_ws_update" on public.proposals;
create policy "proposals_ws_update" on public.proposals for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "proposals_ws_delete" on public.proposals;
create policy "proposals_ws_delete" on public.proposals for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 8. contracts — binding agreements with customers.
-- -----------------------------------------------------------------------------
create table if not exists public.contracts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete set null,
  title         text not null,
  content       text,
  status        text not null default 'draft'
                  check (status in ('draft','sent','negotiation','signed','active','expired','terminated','cancelled')),
  start_date    date,
  end_date      date,
  value         numeric(14,2) not null default 0 check (value >= 0),
  signed_at     timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.contracts enable row level security;
create index if not exists contracts_workspace_idx on public.contracts (workspace_id, created_at desc);
create index if not exists contracts_status_idx on public.contracts (workspace_id, status);
drop policy if exists "contracts_ws_select" on public.contracts;
create policy "contracts_ws_select" on public.contracts for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "contracts_ws_insert" on public.contracts;
create policy "contracts_ws_insert" on public.contracts for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "contracts_ws_update" on public.contracts;
create policy "contracts_ws_update" on public.contracts for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "contracts_ws_delete" on public.contracts;
create policy "contracts_ws_delete" on public.contracts for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 9. receipts — payments collected against invoices.
-- -----------------------------------------------------------------------------
create table if not exists public.receipts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete set null,
  invoice_id    uuid references public.invoices (id) on delete set null,
  number        text not null,
  amount        numeric(14,2) not null default 0 check (amount >= 0),
  payment_method text not null default 'cash'
                  check (payment_method in ('cash','card','bank-transfer','paypal','stripe','crypto','check','other')),
  payment_date  timestamptz not null default now(),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, number)
);
alter table public.receipts enable row level security;
create index if not exists receipts_workspace_idx on public.receipts (workspace_id, created_at desc);
create index if not exists receipts_invoice_idx on public.receipts (workspace_id, invoice_id);
drop policy if exists "receipts_ws_select" on public.receipts;
create policy "receipts_ws_select" on public.receipts for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "receipts_ws_insert" on public.receipts;
create policy "receipts_ws_insert" on public.receipts for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "receipts_ws_update" on public.receipts;
create policy "receipts_ws_update" on public.receipts for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "receipts_ws_delete" on public.receipts;
create policy "receipts_ws_delete" on public.receipts for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 10. expenses — money the workspace spends.
-- -----------------------------------------------------------------------------
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  category      text not null default 'general',
  amount        numeric(14,2) not null default 0 check (amount >= 0),
  currency      text not null default 'USD',
  date          date not null default current_date,
  vendor        text,
  description   text,
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','paid','cancelled')),
  approved_by   uuid references auth.users (id) on delete set null,
  approved_at   timestamptz,
  receipt_url   text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.expenses enable row level security;
create index if not exists expenses_workspace_idx on public.expenses (workspace_id, created_at desc);
create index if not exists expenses_status_idx on public.expenses (workspace_id, status);
create index if not exists expenses_category_idx on public.expenses (workspace_id, category);
drop policy if exists "expenses_ws_select" on public.expenses;
create policy "expenses_ws_select" on public.expenses for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "expenses_ws_insert" on public.expenses;
create policy "expenses_ws_insert" on public.expenses for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "expenses_ws_update" on public.expenses;
create policy "expenses_ws_update" on public.expenses for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "expenses_ws_delete" on public.expenses;
create policy "expenses_ws_delete" on public.expenses for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 11. products — what the workspace sells.
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  sku           text,
  description   text,
  price         numeric(14,2) not null default 0 check (price >= 0),
  cost          numeric(14,2) not null default 0 check (cost >= 0),
  currency      text not null default 'USD',
  stock         integer not null default 0,
  category      text,
  tags          text[] not null default '{}',
  is_active     boolean not null default true,
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.products enable row level security;
create index if not exists products_workspace_idx on public.products (workspace_id, created_at desc);
create index if not exists products_active_idx on public.products (workspace_id, is_active);
create index if not exists products_sku_idx on public.products (workspace_id, sku);
create index if not exists products_name_fts_idx on public.products using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));
drop policy if exists "products_ws_select" on public.products;
create policy "products_ws_select" on public.products for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "products_ws_insert" on public.products;
create policy "products_ws_insert" on public.products for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "products_ws_update" on public.products;
create policy "products_ws_update" on public.products for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "products_ws_delete" on public.products;
create policy "products_ws_delete" on public.products for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 12. suppliers — vendors the workspace buys from.
-- -----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  email         text,
  phone         text,
  company       text,
  contact_person text,
  terms         text,
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.suppliers enable row level security;
create index if not exists suppliers_workspace_idx on public.suppliers (workspace_id, created_at desc);
drop policy if exists "suppliers_ws_select" on public.suppliers;
create policy "suppliers_ws_select" on public.suppliers for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "suppliers_ws_insert" on public.suppliers;
create policy "suppliers_ws_insert" on public.suppliers for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "suppliers_ws_update" on public.suppliers;
create policy "suppliers_ws_update" on public.suppliers for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "suppliers_ws_delete" on public.suppliers;
create policy "suppliers_ws_delete" on public.suppliers for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 13. purchase_orders — orders placed to suppliers.
-- -----------------------------------------------------------------------------
create table if not exists public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  supplier_id   uuid references public.suppliers (id) on delete set null,
  number        text not null,
  status        text not null default 'draft'
                  check (status in ('draft','sent','acknowledged','partial','received','cancelled')),
  issue_date    date not null default current_date,
  expected_date date,
  subtotal      numeric(14,2) not null default 0 check (subtotal >= 0),
  tax           numeric(14,2) not null default 0 check (tax >= 0),
  total         numeric(14,2) not null default 0 check (total >= 0),
  currency      text not null default 'USD',
  items         jsonb not null default '[]',
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, number)
);
alter table public.purchase_orders enable row level security;
create index if not exists purchase_orders_workspace_idx on public.purchase_orders (workspace_id, created_at desc);
create index if not exists purchase_orders_status_idx on public.purchase_orders (workspace_id, status);
drop policy if exists "purchase_orders_ws_select" on public.purchase_orders;
create policy "purchase_orders_ws_select" on public.purchase_orders for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "purchase_orders_ws_insert" on public.purchase_orders;
create policy "purchase_orders_ws_insert" on public.purchase_orders for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "purchase_orders_ws_update" on public.purchase_orders;
create policy "purchase_orders_ws_update" on public.purchase_orders for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "purchase_orders_ws_delete" on public.purchase_orders;
create policy "purchase_orders_ws_delete" on public.purchase_orders for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 14. projects — internal / client projects.
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  description   text,
  status        text not null default 'planning'
                  check (status in ('planning','active','on-hold','completed','cancelled','archived')),
  start_date    date,
  end_date      date,
  budget        numeric(14,2) not null default 0 check (budget >= 0),
  client_id     uuid references public.customers (id) on delete set null,
  manager_id    uuid references auth.users (id) on delete set null,
  team          jsonb not null default '[]',
  progress      integer not null default 0 check (progress >= 0 and progress <= 100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.projects enable row level security;
create index if not exists projects_workspace_idx on public.projects (workspace_id, created_at desc);
create index if not exists projects_status_idx on public.projects (workspace_id, status);
drop policy if exists "projects_ws_select" on public.projects;
create policy "projects_ws_select" on public.projects for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "projects_ws_insert" on public.projects;
create policy "projects_ws_insert" on public.projects for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "projects_ws_update" on public.projects;
create policy "projects_ws_update" on public.projects for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "projects_ws_delete" on public.projects;
create policy "projects_ws_delete" on public.projects for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 15. calendar_events — workspace calendar.
-- -----------------------------------------------------------------------------
create table if not exists public.calendar_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  title         text not null,
  description   text,
  type          text not null default 'event'
                  check (type in ('event','meeting','reminder','deadline','task','milestone','other')),
  start_time    timestamptz not null default now(),
  end_time      timestamptz,
  all_day       boolean not null default false,
  location      text,
  attendees     jsonb not null default '[]',
  reminder_minutes integer default 0 check (reminder_minutes >= 0),
  recurrence    jsonb,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.calendar_events enable row level security;
create index if not exists calendar_events_workspace_idx on public.calendar_events (workspace_id, start_time);
create index if not exists calendar_events_type_idx on public.calendar_events (workspace_id, type);
drop policy if exists "calendar_events_ws_select" on public.calendar_events;
create policy "calendar_events_ws_select" on public.calendar_events for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "calendar_events_ws_insert" on public.calendar_events;
create policy "calendar_events_ws_insert" on public.calendar_events for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "calendar_events_ws_update" on public.calendar_events;
create policy "calendar_events_ws_update" on public.calendar_events for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "calendar_events_ws_delete" on public.calendar_events;
create policy "calendar_events_ws_delete" on public.calendar_events for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 16. transactions — ledger of money in / out (double-entry side).
-- -----------------------------------------------------------------------------
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  type          text not null check (type in ('income','expense','transfer','adjustment')),
  category      text not null default 'general',
  amount        numeric(14,2) not null default 0,
  currency      text not null default 'USD',
  date          date not null default current_date,
  description   text,
  reference_id  uuid,
  reference_type text,
  account       text,
  status        text not null default 'pending'
                  check (status in ('pending','cleared','void')),
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.transactions enable row level security;
create index if not exists transactions_workspace_idx on public.transactions (workspace_id, date desc);
create index if not exists transactions_type_idx on public.transactions (workspace_id, type);
create index if not exists transactions_reference_idx on public.transactions (workspace_id, reference_id, reference_type);
drop policy if exists "transactions_ws_select" on public.transactions;
create policy "transactions_ws_select" on public.transactions for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "transactions_ws_insert" on public.transactions;
create policy "transactions_ws_insert" on public.transactions for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "transactions_ws_update" on public.transactions;
create policy "transactions_ws_update" on public.transactions for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "transactions_ws_delete" on public.transactions;
create policy "transactions_ws_delete" on public.transactions for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 17. companies — the workspace's own company profile(s) (multi-entity).
-- -----------------------------------------------------------------------------
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  legal_name    text,
  tax_id        text,
  email         text,
  phone         text,
  website       text,
  logo_url      text,
  address       jsonb,
  settings      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.companies enable row level security;
create index if not exists companies_workspace_idx on public.companies (workspace_id, created_at desc);
drop policy if exists "companies_ws_select" on public.companies;
create policy "companies_ws_select" on public.companies for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "companies_ws_insert" on public.companies;
create policy "companies_ws_insert" on public.companies for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "companies_ws_update" on public.companies;
create policy "companies_ws_update" on public.companies for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "companies_ws_delete" on public.companies;
create policy "companies_ws_delete" on public.companies for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 18. accounting_entries — double-entry ledger rows.
-- -----------------------------------------------------------------------------
create table if not exists public.accounting_entries (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  date          date not null default current_date,
  description   text,
  debit_account  text not null,
  credit_account text not null,
  amount        numeric(14,2) not null default 0 check (amount >= 0),
  currency      text not null default 'USD',
  reference_id  uuid,
  reference_type text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.accounting_entries enable row level security;
create index if not exists accounting_entries_workspace_idx on public.accounting_entries (workspace_id, date desc);
create index if not exists accounting_entries_account_idx on public.accounting_entries (workspace_id, debit_account, credit_account);
drop policy if exists "accounting_entries_ws_select" on public.accounting_entries;
create policy "accounting_entries_ws_select" on public.accounting_entries for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "accounting_entries_ws_insert" on public.accounting_entries;
create policy "accounting_entries_ws_insert" on public.accounting_entries for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "accounting_entries_ws_update" on public.accounting_entries;
create policy "accounting_entries_ws_update" on public.accounting_entries for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "accounting_entries_ws_delete" on public.accounting_entries;
create policy "accounting_entries_ws_delete" on public.accounting_entries for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- updated_at triggers (re-use the shared `public.set_updated_at()` from 0003).
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'customers','contacts','leads','opportunities','invoices','quotations',
    'proposals','contracts','receipts','expenses','products','suppliers',
    'purchase_orders','projects','calendar_events','transactions','companies',
    'accounting_entries'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t);
  end loop;
end;
$$;
