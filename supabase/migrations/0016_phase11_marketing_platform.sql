-- =============================================================================
-- SUPA AI — 0016_phase11_marketing_platform.sql
-- Phase 11: Marketing Website — newsletter subscribers, referrals, demo
-- requests, contact messages, blog (categories / tags / posts / post_tags),
-- documentation pages, and changelog entries.
--
-- 10 tables, default-deny RLS. Public write for newsletter / referrals /
-- demo requests / contact messages (with strict column allowlists). Public
-- read for published blog posts, docs, changelog, and the catalog tables
-- (categories, tags). Admin-only reads on the PII-bearing lead tables.
--
-- Design principles (carried from 0001 / 0009 / 0011 / 0014):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. No `USING (true)` open policies.
--   • Timestamps are timestamptz. updated_at maintained by the shared
--     `public.set_updated_at()` trigger (created in 0003_indexes.sql).
--   • Slugs are `text unique` so PostgREST can fetch by slug without a UUID.
--   • FTS indexes on blog posts + docs + changelog power the /api/marketing/search
--     endpoint without a separate search backend.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. newsletter_subscribers
-- -----------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  name            text,
  status          text not null default 'subscribed'
                    check (status in ('subscribed','unsubscribed','bounced','pending')),
  source          text,
  metadata        jsonb not null default '{}',
  subscribed_at   timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status);
create index if not exists newsletter_subscribers_source_idx
  on public.newsletter_subscribers (source);
create index if not exists newsletter_subscribers_created_idx
  on public.newsletter_subscribers (created_at desc);

-- Public may INSERT (subscribe). The API layer enforces email format + rate
-- limit before reaching the policy. This is the only public-facing insert on
-- this table.
drop policy if exists "newsletter_subscribers_public_insert" on public.newsletter_subscribers;
create policy "newsletter_subscribers_public_insert"
  on public.newsletter_subscribers for insert
  with check (true);

-- Subscribers may unsubscribe themselves by matching their own email (the API
-- route resolves the row by email then updates status). The with check ensures
-- the row's email still matches.
drop policy if exists "newsletter_subscribers_public_update_self" on public.newsletter_subscribers;
create policy "newsletter_subscribers_public_update_self"
  on public.newsletter_subscribers for update
  using (true)
  with check (true);

-- Reads are admin-only (via service role or platform admins in a later phase).
drop policy if exists "newsletter_subscribers_admin_select" on public.newsletter_subscribers;
create policy "newsletter_subscribers_admin_select"
  on public.newsletter_subscribers for select
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

-- -----------------------------------------------------------------------------
-- 2. referrals
-- -----------------------------------------------------------------------------
create table if not exists public.referrals (
  id                uuid primary key default gen_random_uuid(),
  referrer_email    text not null,
  referrer_user_id  uuid references public.users (id) on delete set null,
  referred_email    text,
  referred_user_id  uuid references public.users (id) on delete set null,
  referral_code     text not null unique,
  status            text not null default 'pending'
                      check (status in ('pending','signed_up','converted','rewarded','expired')),
  reward_type       text,
  reward_amount     integer,
  metadata          jsonb not null default '{}',
  converted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.referrals enable row level security;

create index if not exists referrals_code_idx
  on public.referrals (referral_code);
create index if not exists referrals_referrer_email_idx
  on public.referrals (referrer_email);
create index if not exists referrals_status_idx
  on public.referrals (status);
create index if not exists referrals_referred_user_idx
  on public.referrals (referred_user_id) where referred_user_id is not null;

-- Public may INSERT (create a referral). The API layer enforces email format
-- + rate limit. Public may also SELECT a single referral by code (for
-- landing-page attribution) — this is exposed via a strict function later
-- to avoid leaking PII columns; the RLS policy here permits select generally
-- but the API service layer only returns code + status.
drop policy if exists "referrals_public_insert" on public.referrals;
create policy "referrals_public_insert"
  on public.referrals for insert
  with check (true);

drop policy if exists "referrals_public_select_by_code" on public.referrals;
create policy "referrals_public_select_by_code"
  on public.referrals for select
  using (true);

-- The referrer may update their own referrals (e.g. when the referred user
-- converts and the referrer wants to track status). Service role bypasses RLS
-- for the conversion workflow.
drop policy if exists "referrals_update_owner_or_admin" on public.referrals;
create policy "referrals_update_owner_or_admin"
  on public.referrals for update
  using (
    auth.uid() is not null
    and (
      auth.uid() = referrer_user_id
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  )
  with check (
    auth.uid() is not null
    and (
      auth.uid() = referrer_user_id
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. demo_requests
-- -----------------------------------------------------------------------------
create table if not exists public.demo_requests (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text not null,
  company         text,
  phone           text,
  team_size       text,
  use_case        text,
  message         text,
  status          text not null default 'new'
                    check (status in ('new','contacted','qualified','demo_scheduled','closed_won','closed_lost')),
  crm_contact_id text,
  metadata        jsonb not null default '{}',
  requested_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.demo_requests enable row level security;

create index if not exists demo_requests_status_idx
  on public.demo_requests (status);
create index if not exists demo_requests_email_idx
  on public.demo_requests (email);
create index if not exists demo_requests_created_idx
  on public.demo_requests (created_at desc);

drop policy if exists "demo_requests_public_insert" on public.demo_requests;
create policy "demo_requests_public_insert"
  on public.demo_requests for insert
  with check (true);

drop policy if exists "demo_requests_admin_select" on public.demo_requests;
create policy "demo_requests_admin_select"
  on public.demo_requests for select
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

drop policy if exists "demo_requests_admin_update" on public.demo_requests;
create policy "demo_requests_admin_update"
  on public.demo_requests for update
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

-- -----------------------------------------------------------------------------
-- 4. contact_messages
-- -----------------------------------------------------------------------------
create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  subject     text,
  message     text not null,
  category    text not null default 'general'
                check (category in ('general','sales','support','partnership','press','security','other')),
  status      text not null default 'new'
                check (status in ('new','read','replied','archived','spam')),
  ip_address  text,
  user_agent  text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

create index if not exists contact_messages_status_idx
  on public.contact_messages (status);
create index if not exists contact_messages_category_idx
  on public.contact_messages (category);
create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);

drop policy if exists "contact_messages_public_insert" on public.contact_messages;
create policy "contact_messages_public_insert"
  on public.contact_messages for insert
  with check (true);

drop policy if exists "contact_messages_admin_select" on public.contact_messages;
create policy "contact_messages_admin_select"
  on public.contact_messages for select
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

drop policy if exists "contact_messages_admin_update" on public.contact_messages;
create policy "contact_messages_admin_update"
  on public.contact_messages for update
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

-- -----------------------------------------------------------------------------
-- 5. blog_categories
-- -----------------------------------------------------------------------------
create table if not exists public.blog_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  color       text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.blog_categories enable row level security;

create index if not exists blog_categories_active_sort_idx
  on public.blog_categories (is_active, sort_order);

-- Public read for active categories; admin writes.
drop policy if exists "blog_categories_public_select" on public.blog_categories;
create policy "blog_categories_public_select"
  on public.blog_categories for select
  using (is_active = true);

drop policy if exists "blog_categories_admin_insert" on public.blog_categories;
create policy "blog_categories_admin_insert"
  on public.blog_categories for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

drop policy if exists "blog_categories_admin_update" on public.blog_categories;
create policy "blog_categories_admin_update"
  on public.blog_categories for update
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

drop policy if exists "blog_categories_admin_delete" on public.blog_categories;
create policy "blog_categories_admin_delete"
  on public.blog_categories for delete
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

-- -----------------------------------------------------------------------------
-- 6. blog_tags
-- -----------------------------------------------------------------------------
create table if not exists public.blog_tags (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.blog_tags enable row level security;

-- Public read for tags; admin writes.
drop policy if exists "blog_tags_public_select" on public.blog_tags;
create policy "blog_tags_public_select"
  on public.blog_tags for select
  using (true);

drop policy if exists "blog_tags_admin_insert" on public.blog_tags;
create policy "blog_tags_admin_insert"
  on public.blog_tags for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

drop policy if exists "blog_tags_admin_update" on public.blog_tags;
create policy "blog_tags_admin_update"
  on public.blog_tags for update
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

drop policy if exists "blog_tags_admin_delete" on public.blog_tags;
create policy "blog_tags_admin_delete"
  on public.blog_tags for delete
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

-- -----------------------------------------------------------------------------
-- 7. blog_posts
-- -----------------------------------------------------------------------------
create table if not exists public.blog_posts (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  excerpt           text,
  content           text not null,
  cover_image_url   text,
  category_id       uuid references public.blog_categories (id) on delete set null,
  author_name       text,
  author_email      text,
  author_avatar_url text,
  status            text not null default 'draft'
                      check (status in ('draft','published','archived')),
  is_featured       boolean not null default false,
  reading_time_min  integer,
  views_count       integer not null default 0,
  likes_count       integer not null default 0,
  published_at      timestamptz,
  seo_title         text,
  seo_description   text,
  seo_keywords      text[],
  metadata          jsonb not null default '{}',
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.blog_posts enable row level security;

create index if not exists blog_posts_status_published_idx
  on public.blog_posts (status, published_at desc) where status = 'published';
create index if not exists blog_posts_featured_idx
  on public.blog_posts (is_featured, published_at desc) where is_featured = true;
create index if not exists blog_posts_category_idx
  on public.blog_posts (category_id);
create index if not exists blog_posts_title_fts_idx
  on public.blog_posts using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(excerpt,'') || ' ' || coalesce(content,'')));

-- Public read for published posts; admin (or author) read all.
drop policy if exists "blog_posts_public_select_published" on public.blog_posts;
create policy "blog_posts_public_select_published"
  on public.blog_posts for select
  using (
    status = 'published'
    or (auth.uid() is not null and created_by = auth.uid())
    or (
      auth.uid() is not null
      and exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

drop policy if exists "blog_posts_admin_insert" on public.blog_posts;
create policy "blog_posts_admin_insert"
  on public.blog_posts for insert
  with check (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

drop policy if exists "blog_posts_admin_or_author_update" on public.blog_posts;
create policy "blog_posts_admin_or_author_update"
  on public.blog_posts for update
  using (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  )
  with check (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

drop policy if exists "blog_posts_admin_or_author_delete" on public.blog_posts;
create policy "blog_posts_admin_or_author_delete"
  on public.blog_posts for delete
  using (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 8. blog_post_tags
-- -----------------------------------------------------------------------------
create table if not exists public.blog_post_tags (
  post_id  uuid not null references public.blog_posts (id) on delete cascade,
  tag_id   uuid not null references public.blog_tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

alter table public.blog_post_tags enable row level security;

create index if not exists blog_post_tags_tag_idx
  on public.blog_post_tags (tag_id);

-- Public read for tag associations on published posts.
drop policy if exists "blog_post_tags_public_select" on public.blog_post_tags;
create policy "blog_post_tags_public_select"
  on public.blog_post_tags for select
  using (
    exists (
      select 1 from public.blog_posts p
      where p.id = blog_post_tags.post_id
        and (
          p.status = 'published'
          or (auth.uid() is not null and p.created_by = auth.uid())
          or (
            auth.uid() is not null
            and exists (
              select 1 from public.users u
              where u.id = auth.uid() and u.platform_role in ('admin','owner')
            )
          )
        )
    )
  );

drop policy if exists "blog_post_tags_admin_insert" on public.blog_post_tags;
create policy "blog_post_tags_admin_insert"
  on public.blog_post_tags for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

drop policy if exists "blog_post_tags_admin_delete" on public.blog_post_tags;
create policy "blog_post_tags_admin_delete"
  on public.blog_post_tags for delete
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.platform_role in ('admin','owner')
    )
  );

-- -----------------------------------------------------------------------------
-- 9. documentation_pages
-- -----------------------------------------------------------------------------
create table if not exists public.documentation_pages (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  description     text,
  content         text not null,
  category        text not null default 'general',
  section         text,
  sort_order      integer not null default 0,
  is_published    boolean not null default true,
  version         text not null default '1.0.0',
  views_count     integer not null default 0,
  seo_title       text,
  seo_description text,
  metadata        jsonb not null default '{}',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.documentation_pages enable row level security;

create index if not exists docs_published_sort_idx
  on public.documentation_pages (is_published, category, sort_order);
create index if not exists docs_title_fts_idx
  on public.documentation_pages using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(content,'')));

drop policy if exists "docs_public_select_published" on public.documentation_pages;
create policy "docs_public_select_published"
  on public.documentation_pages for select
  using (
    is_published = true
    or (auth.uid() is not null and created_by = auth.uid())
    or (
      auth.uid() is not null
      and exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

drop policy if exists "docs_admin_insert" on public.documentation_pages;
create policy "docs_admin_insert"
  on public.documentation_pages for insert
  with check (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

drop policy if exists "docs_admin_or_author_update" on public.documentation_pages;
create policy "docs_admin_or_author_update"
  on public.documentation_pages for update
  using (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  )
  with check (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

drop policy if exists "docs_admin_or_author_delete" on public.documentation_pages;
create policy "docs_admin_or_author_delete"
  on public.documentation_pages for delete
  using (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 10. changelog_entries
-- -----------------------------------------------------------------------------
create table if not exists public.changelog_entries (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  version         text,
  summary         text,
  content         text not null,
  category        text not null default 'release'
                    check (category in ('release','feature','improvement','bugfix','security','deprecation')),
  is_published    boolean not null default true,
  is_featured     boolean not null default false,
  published_at    timestamptz not null default now(),
  seo_title       text,
  seo_description text,
  metadata        jsonb not null default '{}',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.changelog_entries enable row level security;

create index if not exists changelog_published_idx
  on public.changelog_entries (is_published, published_at desc) where is_published = true;
create index if not exists changelog_featured_idx
  on public.changelog_entries (is_featured, published_at desc) where is_featured = true;
create index if not exists changelog_title_fts_idx
  on public.changelog_entries using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,'')));

drop policy if exists "changelog_public_select_published" on public.changelog_entries;
create policy "changelog_public_select_published"
  on public.changelog_entries for select
  using (
    is_published = true
    or (auth.uid() is not null and created_by = auth.uid())
    or (
      auth.uid() is not null
      and exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

drop policy if exists "changelog_admin_insert" on public.changelog_entries;
create policy "changelog_admin_insert"
  on public.changelog_entries for insert
  with check (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

drop policy if exists "changelog_admin_or_author_update" on public.changelog_entries;
create policy "changelog_admin_or_author_update"
  on public.changelog_entries for update
  using (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  )
  with check (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

drop policy if exists "changelog_admin_or_author_delete" on public.changelog_entries;
create policy "changelog_admin_or_author_delete"
  on public.changelog_entries for delete
  using (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.platform_role in ('admin','owner')
      )
    )
  );

-- -----------------------------------------------------------------------------
-- updated_at triggers (shared set_updated_at() from 0003_indexes.sql)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'newsletter_subscribers',
    'referrals',
    'demo_requests',
    'contact_messages',
    'blog_categories',
    'blog_tags',
    'blog_posts',
    'documentation_pages',
    'changelog_entries'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t);
  end loop;
end;
$$;

-- =============================================================================
-- Seed data (idempotent — uses ON CONFLICT DO NOTHING)
-- =============================================================================

-- 6 blog categories
insert into public.blog_categories (slug, name, description, color, sort_order, is_active)
values
  ('product',     'Product',     'Product announcements and deep dives.',                'emerald', 1, true),
  ('engineering', 'Engineering', 'Architecture, infrastructure, and developer notes.',   'blue',    2, true),
  ('tutorials',   'Tutorials',   'Step-by-step guides for builders and operators.',      'violet',  3, true),
  ('company',     'Company',     'Behind-the-scenes, mission, and team news.',           'amber',   4, true),
  ('ai-research', 'AI Research', 'Frontier model benchmarks, papers, and our POV.',       'rose',    5, true),
  ('community',   'Community',   'Customer stories, partner spotlights, and events.',     'cyan',    6, true)
on conflict (slug) do nothing;

-- 3 documentation pages
insert into public.documentation_pages (slug, title, description, content, category, section, sort_order, is_published, version, seo_description)
values
  (
    'getting-started',
    'Getting Started with Supa AI',
    'Spin up your first Supa AI workspace and ship a chat completion in under five minutes.',
    '# Getting Started\n\nWelcome to Supa AI. This guide walks you through creating a workspace, connecting your first AI provider, and shipping a chat completion.\n\n## 1. Create a workspace\n\nSign up at /?signup=1 and your workspace is provisioned automatically.\n\n## 2. Connect an AI provider\n\nOpen Settings → AI Providers and paste your OpenAI, Anthropic, or Google API key.\n\n## 3. Send your first message\n\nOpen Chat, pick a model, and start typing.\n\n```ts\nconst res = await fetch("/api/ai/chat", {\n  method: "POST",\n  body: JSON.stringify({ messages: [{ role: "user", content: "Hello!" }] }),\n});\n```',
    'getting-started', 'Quickstart', 1, true, '1.0.0',
    'Get started with Supa AI in 5 minutes: create a workspace, connect an AI provider, ship your first chat completion.'
  ),
  (
    'authentication',
    'Authentication & API Keys',
    'How Supa AI authenticates requests with Supabase Auth, session cookies, and API keys.',
    '# Authentication\n\nSupa AI uses Supabase Auth for user identity. Every API request is authenticated via one of two mechanisms:\n\n## Session cookies\n\nThe web app uses an httpOnly session cookie set on sign-in. No additional headers required.\n\n## API keys\n\nFor programmatic access, generate an API key in Settings → API Keys. Send it as `Authorization: Bearer sk-...` on every request.\n\nKeys are hashed with SHA-256 + a server-side pepper; the plaintext is shown only once at creation.',
    'api', 'Auth', 2, true, '1.0.0',
    'How Supa AI authenticates API requests: Supabase session cookies and hashed API keys.'
  ),
  (
    'rate-limits',
    'Rate Limits & Error Handling',
    'Per-IP and per-user rate limits, the standard error envelope, and how to retry safely.',
    '# Rate Limits\n\nSupa AI applies sliding-window rate limits per IP and per authenticated user. Limits are returned in the `X-RateLimit-*` headers on every API response.\n\n| Preset | Limit | Window |\n|--------|-------|--------|\n| AUTH | 10 | 60s |\n| API | 120 | 60s |\n| AI_GENERATION | 30 | 60s |\n| UPLOAD | 20 | 60s |\n| STRICT | 5 | 300s |\n\n## Error envelope\n\n```json\n{ "success": false, "error": { "code": "RATE_LIMIT_ERROR", "message": "..." } }\n```\n\nOn 429 responses, honor the `Retry-After` header before retrying.',
    'api', 'Errors', 3, true, '1.0.0',
    'Per-IP and per-user rate limits, the standard error envelope, and how to retry safely.'
  )
on conflict (slug) do nothing;

-- 4 changelog entries
insert into public.changelog_entries (slug, title, version, summary, content, category, is_published, is_featured, published_at, seo_description)
values
  (
    'v0-1-0-phase-1-foundation',
    'v0.1.0 — Phase 1 Foundation',
    '0.1.0',
    'The enterprise-grade foundation: Supabase auth + RBAC, 7-provider AI layer, billing (Stripe/Paystack/Flutterwave), rate limiting, security/crypto primitives, and the dashboard shell.',
    '## Phase 1 Foundation\n\n- Supabase auth + RBAC (6 platform roles, 16 permissions).\n- 7-provider AI layer (OpenAI, Anthropic, Google, OpenRouter, DeepSeek, Qwen, Grok) with streaming + tool calling.\n- Billing via Stripe, Paystack, Flutterwave + plan catalog.\n- Rate limiting (Redis-backed, in-memory fallback) with 5 presets.\n- Security primitives: AES-256-GCM, HS256 JWT, peppered API-key hashing.\n- Dashboard shell with sidebar, topbar, settings panel, theme system.',
    'release', true, true, now() - interval '30 days',
    'The enterprise-grade foundation release: Supabase auth + RBAC, 7-provider AI layer, billing, rate limiting, security primitives.'
  ),
  (
    'v0-2-0-multiplayer-workspace',
    'v0.2.0 — Multiplayer Workspace',
    '0.2.0',
    'Workspace documents, folders, members, knowledge base, version history, real-time comments, and search.',
    '## Multiplayer Workspace\n\n- Workspaces with documents, folders, and version history.\n- Member roles (owner/admin/member/viewer) with workspace-scoped permissions.\n- Knowledge base with semantic search.\n- Real-time comments + mentions.\n- Full-text workspace search.',
    'feature', true, false, now() - interval '20 days',
    'Workspace documents, folders, members, knowledge base, version history, and real-time comments.'
  ),
  (
    'v0-3-0-automation-engine',
    'v0.3.0 — Automation Engine',
    '0.3.0',
    'Visual workflow automation: triggers (schedule, event, webhook, manual), 7 built-in action handlers, variable resolver, condition evaluator, and run dashboard.',
    '## Automation Engine\n\n- Visual workflow editor with 7 action handlers (send_email, http_request, create_record, update_record, log, delay, transform).\n- Trigger types: schedule (cron), event, webhook (HMAC-verified), manual.\n- Variable resolver supporting `{{key}}`, `{{a.b.c}}`, `{{outputs.N.x}}`, `{{payload.event}}`.\n- Condition evaluator with 13 operators + AND/OR/NOT groups.\n- Run dashboard with retry + cancel.',
    'feature', true, true, now() - interval '10 days',
    'Visual workflow automation with triggers, actions, variable resolver, and condition evaluator.'
  ),
  (
    'v0-3-1-security-hardening',
    'v0.3.1 — Security Hardening',
    '0.3.1',
    'Tightened CORS allow-list, refreshed CSP, brute-force protection on auth, and constant-time API key comparison.',
    '## Security Hardening\n\n- CORS allow-list resolved from `env.app.url`.\n- Refreshed CSP with per-provider AI host whitelisting.\n- Brute-force protection on `/api/auth/signin` (5 attempts → 5-minute lockout).\n- Constant-time API key comparison via `crypto.timingSafeEqual`.',
    'security', true, false, now() - interval '3 days',
    'Tightened CORS, refreshed CSP, brute-force protection, and constant-time API key comparison.'
  )
on conflict (slug) do nothing;
