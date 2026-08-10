-- =============================================
-- Phase 8: Business AI Suite
-- =============================================

-- Extend activity_action enum
ALTER TYPE public.activity_action RENAME TO activity_action_old;
CREATE TYPE public.activity_action AS ENUM (
  'user_signup','user_login','login_success','login_failed',
  'profile_update','avatar_update',
  'workspace_create','workspace_update','workspace_delete',
  'member_join','member_leave','member_role_change',
  'invitation_send','invitation_accept','invitation_revoke',
  'settings_update','chat_created','content_generated',
  'image_generated','video_generated','voice_generated','audio_uploaded',
  'security_event',
  'document_created','document_updated','document_deleted',
  'document_restored','document_archived','document_exported','document_duplicated',
  'version_created','version_restored',
  'folder_created','folder_updated','folder_deleted',
  'comment_added','comment_resolved','mention_created',
  'file_uploaded','file_deleted','file_downloaded',
  'knowledge_entry_created','knowledge_entry_updated','search_executed',
  'lead_created','lead_updated','lead_converted',
  'opportunity_created','opportunity_won','opportunity_lost',
  'customer_created','contact_created','company_created',
  'invoice_created','invoice_sent','invoice_paid','invoice_overdue',
  'quotation_created','quotation_accepted','quotation_converted',
  'proposal_created','proposal_accepted',
  'contract_created','contract_signed','contract_expired',
  'expense_created','expense_approved','receipt_created',
  'product_created','product_updated','stock_low',
  'purchase_order_created',
  'project_created','task_created','task_completed','milestone_completed',
  'calendar_event_created','payment_received','payment_failed'
);
ALTER TABLE public.activity_logs ALTER COLUMN action TYPE public.activity_action
  USING action::text::public.activity_action;
DROP TYPE public.activity_action_old;

-- ─── Enums ─────────────────────────────────────────

CREATE TYPE public.lead_status AS ENUM (
  'new','contacted','qualified','proposal','negotiation','won','lost','archived'
);
CREATE TYPE public.lead_source AS ENUM (
  'website','referral','social_media','cold_call','event','organic','other'
);
CREATE TYPE public.opportunity_stage AS ENUM (
  'lead','qualification','proposal','negotiation','closed_won','closed_lost'
);
CREATE TYPE public.invoice_status AS ENUM (
  'draft','sent','paid','partially_paid','overdue','cancelled','void'
);
CREATE TYPE public.quotation_status AS ENUM (
  'draft','sent','accepted','rejected','expired','converted'
);
CREATE TYPE public.proposal_status AS ENUM (
  'draft','sent','viewed','accepted','rejected','expired'
);
CREATE TYPE public.proposal_type AS ENUM (
  'sales','business','marketing','project'
);
CREATE TYPE public.contract_type AS ENUM (
  'nda','employment','freelance','service','partnership','consulting','purchase'
);
CREATE TYPE public.contract_status AS ENUM (
  'draft','pending_review','active','expired','terminated','cancelled'
);
CREATE TYPE public.receipt_status AS ENUM (
  'active','voided','refunded'
);
CREATE TYPE public.expense_status AS ENUM (
  'pending','approved','rejected','reimbursed'
);
CREATE TYPE public.payment_method AS ENUM (
  'bank_transfer','card','cash','mobile_money','other'
);
CREATE TYPE public.payment_provider AS ENUM (
  'stripe','paystack','flutterwave','manual'
);
CREATE TYPE public.product_type AS ENUM (
  'physical','digital','service'
);
CREATE TYPE public.task_status AS ENUM (
  'todo','in_progress','in_review','done','cancelled'
);
CREATE TYPE public.task_priority AS ENUM (
  'low','medium','high','urgent'
);
CREATE TYPE public.project_status AS ENUM (
  'planning','active','on_hold','completed','cancelled'
);
CREATE TYPE public.calendar_event_type AS ENUM (
  'meeting','reminder','deadline','event'
);
CREATE TYPE public.transaction_type AS ENUM (
  'income','expense','transfer'
);
CREATE TYPE public.account_type AS ENUM (
  'asset','liability','equity','income','expense'
);
CREATE TYPE public.budget_status AS ENUM (
  'draft','active','closed'
);
CREATE TYPE public.purchase_order_status AS ENUM (
  'draft','submitted','approved','ordered','received','cancelled'
);

-- ─── Helper: workspace member RLS ─────────────────
-- Reused across all business tables

-- ─── companies ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT DEFAULT '',
  website TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  country TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_workspace ON public.companies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_companies_name ON public.companies(workspace_id, name);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view companies" ON public.companies FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = companies.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create companies" ON public.companies FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = companies.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update companies" ON public.companies FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = companies.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete companies" ON public.companies FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = companies.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── contacts ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  job_title TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON public.contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON public.contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts(workspace_id, first_name, last_name);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view contacts" ON public.contacts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = contacts.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create contacts" ON public.contacts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = contacts.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update contacts" ON public.contacts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = contacts.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete contacts" ON public.contacts FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = contacts.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── customers ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  country TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  customer_since TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_invoices INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_workspace ON public.customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_customers_company ON public.customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(workspace_id, name);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view customers" ON public.customers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = customers.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create customers" ON public.customers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = customers.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update customers" ON public.customers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = customers.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete customers" ON public.customers FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = customers.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── leads ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source public.lead_source NOT NULL DEFAULT 'organic',
  status public.lead_status NOT NULL DEFAULT 'new',
  score INTEGER NOT NULL DEFAULT 0,
  value NUMERIC(15,2) DEFAULT 0,
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expected_close_date DATE,
  lost_reason TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_workspace ON public.leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(workspace_id, score DESC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view leads" ON public.leads FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = leads.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create leads" ON public.leads FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = leads.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update leads" ON public.leads FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = leads.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete leads" ON public.leads FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = leads.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── opportunities ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value NUMERIC(15,2) NOT NULL DEFAULT 0,
  stage public.opportunity_stage NOT NULL DEFAULT 'lead',
  probability INTEGER NOT NULL DEFAULT 0,
  expected_close_date DATE,
  description TEXT DEFAULT '',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lost_reason TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_workspace ON public.opportunities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON public.opportunities(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned ON public.opportunities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_opportunities_value ON public.opportunities(workspace_id, value DESC);

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view opportunities" ON public.opportunities FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = opportunities.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create opportunities" ON public.opportunities FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = opportunities.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update opportunities" ON public.opportunities FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = opportunities.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete opportunities" ON public.opportunities FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = opportunities.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── invoices ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  paid_date DATE,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT DEFAULT '',
  terms TEXT DEFAULT '',
  payment_method public.payment_method,
  payment_provider public.payment_provider,
  payment_reference TEXT DEFAULT '',
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON public.invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(workspace_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(workspace_id, issue_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number_unique ON public.invoices(workspace_id, invoice_number);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view invoices" ON public.invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = invoices.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create invoices" ON public.invoices FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = invoices.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update invoices" ON public.invoices FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = invoices.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete invoices" ON public.invoices FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = invoices.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── invoice_items ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invoice viewers can view items" ON public.invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id WHERE i.id = invoice_items.invoice_id AND wm.user_id = auth.uid()));
CREATE POLICY "Invoice creators can add items" ON public.invoice_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id WHERE i.id = invoice_items.invoice_id AND wm.user_id = auth.uid()));
CREATE POLICY "Invoice viewers can update items" ON public.invoice_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id WHERE i.id = invoice_items.invoice_id AND wm.user_id = auth.uid()));
CREATE POLICY "Invoice viewers can delete items" ON public.invoice_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id WHERE i.id = invoice_items.invoice_id AND wm.user_id = auth.uid()));

-- ─── quotations ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  quote_number TEXT NOT NULL,
  status public.quotation_status NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT DEFAULT '',
  terms TEXT DEFAULT '',
  converted_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotations_workspace ON public.quotations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON public.quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(workspace_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_number_unique ON public.quotations(workspace_id, quote_number);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view quotations" ON public.quotations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = quotations.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create quotations" ON public.quotations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = quotations.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update quotations" ON public.quotations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = quotations.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete quotations" ON public.quotations FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = quotations.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── quotation_items ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items(quotation_id);

ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Quotation viewers can view items" ON public.quotation_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.quotations q JOIN public.workspace_members wm ON wm.workspace_id = q.workspace_id WHERE q.id = quotation_items.quotation_id AND wm.user_id = auth.uid()));
CREATE POLICY "Quotation viewers can manage items" ON public.quotation_items FOR INSERT WITH CHECK
  (EXISTS (SELECT 1 FROM public.quotations q JOIN public.workspace_members wm ON wm.workspace_id = q.workspace_id WHERE q.id = quotation_items.quotation_id AND wm.user_id = auth.uid()));
CREATE POLICY "Quotation viewers can update items" ON public.quotation_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.quotations q JOIN public.workspace_members wm ON wm.workspace_id = q.workspace_id WHERE q.id = quotation_items.quotation_id AND wm.user_id = auth.uid()));
CREATE POLICY "Quotation viewers can delete items" ON public.quotation_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.quotations q JOIN public.workspace_members wm ON wm.workspace_id = q.workspace_id WHERE q.id = quotation_items.quotation_id AND wm.user_id = auth.uid()));

-- ─── proposals ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status public.proposal_status NOT NULL DEFAULT 'draft',
  proposal_type public.proposal_type NOT NULL DEFAULT 'sales',
  content TEXT NOT NULL DEFAULT '',
  summary TEXT DEFAULT '',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  value NUMERIC(15,2) DEFAULT 0,
  converted_contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_workspace ON public.proposals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON public.proposals(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_type ON public.proposals(workspace_id, proposal_type);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view proposals" ON public.proposals FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = proposals.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create proposals" ON public.proposals FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = proposals.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update proposals" ON public.proposals FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = proposals.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete proposals" ON public.proposals FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = proposals.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── contracts ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  contract_type public.contract_type NOT NULL DEFAULT 'service',
  status public.contract_status NOT NULL DEFAULT 'draft',
  content TEXT NOT NULL DEFAULT '',
  summary TEXT DEFAULT '',
  start_date DATE,
  end_date DATE,
  value NUMERIC(15,2) DEFAULT 0,
  terms TEXT DEFAULT '',
  variables JSONB NOT NULL DEFAULT '{}',
  version_number INTEGER NOT NULL DEFAULT 1,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_workspace ON public.contracts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_type ON public.contracts(workspace_id, contract_type);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view contracts" ON public.contracts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = contracts.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create contracts" ON public.contracts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = contracts.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update contracts" ON public.contracts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = contracts.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete contracts" ON public.contracts FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = contracts.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── contract_versions ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  summary TEXT DEFAULT '',
  change_summary TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_contract_versions_contract ON public.contract_versions(contract_id);

ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Contract viewers can view versions" ON public.contract_versions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.contracts c JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id WHERE c.id = contract_versions.contract_id AND wm.user_id = auth.uid()));
CREATE POLICY "Contract viewers can create versions" ON public.contract_versions FOR INSERT
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.contracts c JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id WHERE c.id = contract_versions.contract_id AND wm.user_id = auth.uid()));

-- ─── receipts ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'bank_transfer',
  payment_provider public.payment_provider,
  payment_reference TEXT DEFAULT '',
  status public.receipt_status NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT '',
  qr_code_data TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_workspace ON public.receipts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice ON public.receipts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_receipts_customer ON public.receipts(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_number_unique ON public.receipts(workspace_id, receipt_number);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view receipts" ON public.receipts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = receipts.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create receipts" ON public.receipts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = receipts.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update receipts" ON public.receipts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = receipts.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete receipts" ON public.receipts FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = receipts.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── expenses ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT NOT NULL,
  vendor TEXT DEFAULT '',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT DEFAULT '',
  status public.expense_status NOT NULL DEFAULT 'pending',
  reimbursed_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  reimbursed_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reimbursed_at TIMESTAMPTZ,
  budget_id UUID REFERENCES public.budgets(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  ai_categorized BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_workspace ON public.expenses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(workspace_id, expense_date DESC);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view expenses" ON public.expenses FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = expenses.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create expenses" ON public.expenses FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = expenses.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update expenses" ON public.expenses FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = expenses.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete expenses" ON public.expenses FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = expenses.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── products ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT DEFAULT '',
  barcode TEXT DEFAULT '',
  description TEXT DEFAULT '',
  product_type public.product_type NOT NULL DEFAULT 'physical',
  category TEXT DEFAULT '',
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'unit',
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  warehouse_location TEXT DEFAULT '',
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  image_url TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_workspace ON public.products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(workspace_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_stock ON public.products(workspace_id, stock_quantity);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view products" ON public.products FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = products.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create products" ON public.products FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = products.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update products" ON public.products FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = products.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete products" ON public.products FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = products.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── suppliers ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  website TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  rating INTEGER CHECK (rating >= 0 AND rating <= 5),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_workspace ON public.suppliers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(workspace_id, name);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view suppliers" ON public.suppliers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = suppliers.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create suppliers" ON public.suppliers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = suppliers.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update suppliers" ON public.suppliers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = suppliers.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete suppliers" ON public.suppliers FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = suppliers.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── purchase_orders ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  status public.purchase_order_status NOT NULL DEFAULT 'draft',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  notes TEXT DEFAULT '',
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_workspace ON public.purchase_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(workspace_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_number_unique ON public.purchase_orders(workspace_id, po_number);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view purchase orders" ON public.purchase_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = purchase_orders.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create purchase orders" ON public.purchase_orders FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = purchase_orders.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update purchase orders" ON public.purchase_orders FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = purchase_orders.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete purchase orders" ON public.purchase_orders FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = purchase_orders.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── purchase_order_items ───────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  received_quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_po_items_order ON public.purchase_order_items(purchase_order_id);

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PO viewers can view items" ON public.purchase_order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po JOIN public.workspace_members wm ON wm.workspace_id = po.workspace_id WHERE po.id = purchase_order_items.purchase_order_id AND wm.user_id = auth.uid()));
CREATE POLICY "PO viewers can manage items" ON public.purchase_order_items FOR INSERT WITH CHECK
  (EXISTS (SELECT 1 FROM public.purchase_orders po JOIN public.workspace_members wm ON wm.workspace_id = po.workspace_id WHERE po.id = purchase_order_items.purchase_order_id AND wm.user_id = auth.uid()));
CREATE POLICY "PO viewers can update items" ON public.purchase_order_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po JOIN public.workspace_members wm ON wm.workspace_id = po.workspace_id WHERE po.id = purchase_order_items.purchase_order_id AND wm.user_id = auth.uid()));
CREATE POLICY "PO viewers can delete items" ON public.purchase_order_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po JOIN public.workspace_members wm ON wm.workspace_id = po.workspace_id WHERE po.id = purchase_order_items.purchase_order_id AND wm.user_id = auth.uid()));

-- ─── projects ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status public.project_status NOT NULL DEFAULT 'planning',
  start_date DATE,
  end_date DATE,
  budget NUMERIC(15,2) DEFAULT 0,
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON public.projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_assigned ON public.projects(assigned_to);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view projects" ON public.projects FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create projects" ON public.projects FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update projects" ON public.projects FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete projects" ON public.projects FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── project_milestones ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date DATE,
  status public.task_status NOT NULL DEFAULT 'todo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON public.project_milestones(project_id);

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project viewers can view milestones" ON public.project_milestones FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = project_milestones.project_id AND wm.user_id = auth.uid()));
CREATE POLICY "Project viewers can manage milestones" ON public.project_milestones FOR INSERT WITH CHECK
  (EXISTS (SELECT 1 FROM public.projects p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = project_milestones.project_id AND wm.user_id = auth.uid()));
CREATE POLICY "Project viewers can update milestones" ON public.project_milestones FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = project_milestones.project_id AND wm.user_id = auth.uid()));
CREATE POLICY "Project viewers can delete milestones" ON public.project_milestones FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = project_milestones.project_id AND wm.user_id = auth.uid()));

-- ─── tasks ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON public.tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(workspace_id, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON public.tasks(milestone_id);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view tasks" ON public.tasks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = tasks.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create tasks" ON public.tasks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = tasks.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update tasks" ON public.tasks FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = tasks.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete tasks" ON public.tasks FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = tasks.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── calendar_events ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  event_type public.calendar_event_type NOT NULL DEFAULT 'event',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT false,
  location TEXT DEFAULT '',
  attendees UUID[] NOT NULL DEFAULT '{}',
  reminders JSONB NOT NULL DEFAULT '[]',
  recurrence_rule JSONB,
  external_id TEXT DEFAULT '',
  external_provider TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_workspace ON public.calendar_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON public.calendar_events(workspace_id, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_type ON public.calendar_events(workspace_id, event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_creator ON public.calendar_events(created_by);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view events" ON public.calendar_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = calendar_events.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create events" ON public.calendar_events FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = calendar_events.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace members can update events" ON public.calendar_events FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = calendar_events.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins/creators can delete events" ON public.calendar_events FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = calendar_events.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')) OR created_by = auth.uid());

-- ─── accounts (Chart of Accounts) ───────────────────

CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  account_type public.account_type NOT NULL,
  description TEXT DEFAULT '',
  parent_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_workspace ON public.accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON public.accounts(workspace_id, account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON public.accounts(parent_id);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view accounts" ON public.accounts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = accounts.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins can create accounts" ON public.accounts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = accounts.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "Workspace admins can update accounts" ON public.accounts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = accounts.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "Workspace admins can delete accounts" ON public.accounts FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = accounts.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')));

-- ─── transactions ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  opposite_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  transaction_type public.transaction_type NOT NULL,
  description TEXT DEFAULT '',
  reference_type TEXT DEFAULT '',
  reference_id UUID,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_workspace ON public.transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(workspace_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(workspace_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON public.transactions(reference_type, reference_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view transactions" ON public.transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = transactions.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create transactions" ON public.transactions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = transactions.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Workspace admins can update transactions" ON public.transactions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = transactions.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "Workspace admins can delete transactions" ON public.transactions FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = transactions.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')));

-- ─── journal_entries ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace ON public.journal_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries(workspace_id, entry_date DESC);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view journal entries" ON public.journal_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = journal_entries.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace members can create journal entries" ON public.journal_entries FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = journal_entries.workspace_id AND user_id = auth.uid()) AND created_by = auth.uid());

-- ─── journal_entry_lines ────────────────────────────

CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  debit NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit NUMERIC(15,2) NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_je_lines_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_je_lines_account ON public.journal_entry_lines(account_id);

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "JE viewers can view lines" ON public.journal_entry_lines FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.journal_entries je JOIN public.workspace_members wm ON wm.workspace_id = je.workspace_id WHERE je.id = journal_entry_lines.journal_entry_id AND wm.user_id = auth.uid()));
CREATE POLICY "JE viewers can create lines" ON public.journal_entry_lines FOR INSERT WITH CHECK
  (EXISTS (SELECT 1 FROM public.journal_entries je JOIN public.workspace_members wm ON wm.workspace_id = je.workspace_id WHERE je.id = journal_entry_lines.journal_entry_id AND wm.user_id = auth.uid()));

-- ─── budgets ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  spent NUMERIC(15,2) NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status public.budget_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budgets_workspace ON public.budgets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON public.budgets(workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON public.budgets(workspace_id, status);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view budgets" ON public.budgets FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = budgets.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Workspace admins can create budgets" ON public.budgets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = budgets.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "Workspace admins can update budgets" ON public.budgets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = budgets.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "Workspace admins can delete budgets" ON public.budgets FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = budgets.workspace_id AND user_id = auth.uid() AND role IN ('owner','admin')));

-- ─── Auto-update triggers ───────────────────────────

DO $$ BEGIN
  CREATE OR REPLACE FUNCTION public.trigger_updated_at() RETURNS TRIGGER AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $$ LANGUAGE plpgsql;

  -- Apply to all Phase 8 tables
  CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_opportunities_updated_at BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_quotations_updated_at BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_proposals_updated_at BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_receipts_updated_at BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_milestones_updated_at BEFORE UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
  CREATE TRIGGER set_budgets_updated_at BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Storage bucket for business documents ──────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-docs',
  'business-docs',
  false,
  104857600,
  '{
    application/pdf,
    application/msword,
    application/vnd.openxmlformats-officedocument.wordprocessingml.document,
    application/vnd.ms-excel,
    application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
    text/csv,
    text/plain,
    image/png,
    image/jpeg,
    image/webp
  }'
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for business-docs bucket
CREATE POLICY "Workspace members can upload business docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'business-docs'
    AND (storage.foldername(name))[2] IN (
      SELECT workspace_id::text FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can view business docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'business-docs'
    AND (storage.foldername(name))[2] IN (
      SELECT workspace_id::text FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Business doc uploaders or admins can update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'business-docs'
    AND (
      (storage.foldername(name))[3] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = (storage.foldername(name))[2]::uuid
        AND user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "Business doc uploaders or admins can delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'business-docs'
    AND (
      (storage.foldername(name))[3] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = (storage.foldername(name))[2]::uuid
        AND user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );
